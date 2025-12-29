/* ===========================
   CineMatrix - Main App
   Application Logic & Events
   =========================== */

const App = {
    // Application State
    state: {
        currentShow: null,
        currentSeason: 1,
        seasonsData: [],
        searchTimeout: null,
        recentSearches: []
    },

    /**
     * Initialize the application
     */
    init() {
        // Initialize UI module
        UI.init();

        // Load recent searches from localStorage
        this.loadRecentSearches();

        // Set up event listeners
        this.setupEventListeners();

        // Render initial UI
        this.renderRecentSearches();

        console.log('🎬 CineMatrix initialized');
    },

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Search input
        UI.elements.searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });

        UI.elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstSuggestion = document.querySelector('.suggestion-item');
                if (firstSuggestion) {
                    firstSuggestion.click();
                }
            }
            if (e.key === 'Escape') {
                UI.hideSuggestions();
            }
        });

        UI.elements.searchInput.addEventListener('focus', () => {
            if (UI.elements.searchInput.value.trim().length >= 2) {
                this.handleSearchInput(UI.elements.searchInput.value);
            }
        });

        // Clear search button
        UI.elements.clearSearch.addEventListener('click', () => {
            UI.elements.searchInput.value = '';
            UI.updateClearButton(false);
            UI.hideSuggestions();
            UI.elements.searchInput.focus();
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                UI.hideSuggestions();
            }
        });

        // Download button
        UI.elements.downloadBtn.addEventListener('click', () => {
            const format = UI.elements.downloadFormat.value;
            const title = this.state.currentShow?.title || 'Series';
            Download.downloadImage(format, title);
        });

        // Share button
        UI.elements.shareBtn.addEventListener('click', () => {
            const title = this.state.currentShow?.title || 'Series';
            Download.shareImage(title);
        });

        // Save Image button (in graph card)
        const saveImageBtn = document.getElementById('saveImageBtn');
        if (saveImageBtn) {
            saveImageBtn.addEventListener('click', () => {
                const title = this.state.currentShow?.title || 'Series';
                Download.downloadImage('png', title);
            });
        }

        // About modal
        UI.elements.aboutBtn.addEventListener('click', () => {
            UI.showAboutModal();
        });

        UI.elements.closeModal.addEventListener('click', () => {
            UI.hideAboutModal();
        });

        UI.elements.aboutModal.addEventListener('click', (e) => {
            if (e.target === UI.elements.aboutModal) {
                UI.hideAboutModal();
            }
        });

        // Keyboard shortcut for modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && UI.elements.aboutModal.classList.contains('active')) {
                UI.hideAboutModal();
            }
        });
    },

    /**
     * Handle search input with debouncing
     * @param {string} query - Search query
     */
    handleSearchInput(query) {
        // Update clear button visibility
        UI.updateClearButton(query.length > 0);

        // Clear previous timeout
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
        }

        // Don't search for short queries
        if (query.trim().length < 2) {
            UI.hideSuggestions();
            return;
        }

        // Debounce search (150ms - fast response)
        this.state.searchTimeout = setTimeout(async () => {
            try {
                // Show loading in suggestions
                UI.elements.searchSuggestions.innerHTML = '<div class="suggestion-message">Searching...</div>';
                UI.elements.searchSuggestions.classList.add('active');

                const results = await API.searchShows(query);

                if (results.length > 0) {
                    UI.showSuggestions(results, (id, title) => {
                        this.selectShow(id, title);
                    });
                } else {
                    UI.elements.searchSuggestions.innerHTML = '<div class="suggestion-message">No results found</div>';
                }
            } catch (error) {
                console.error('Search error:', error);
                UI.elements.searchSuggestions.innerHTML = '<div class="suggestion-message" style="color:#ff6b6b;">Search failed. Try again.</div>';
            }
        }, 150);
    },

    /**
     * Select a show and load its data
     * @param {string} showId - ID of the show (TMDB ID)
     * @param {string} title - Title of the show
     */
    async selectShow(showId, title) {
        // Update search input
        UI.elements.searchInput.value = title;
        UI.updateClearButton(true);
        UI.hideSuggestions();

        // Add to recent searches
        this.addToRecentSearches(title);

        // Reset state
        this.state.seasonsData = [];

        // Show loading state
        UI.showLoading();

        try {
            // Fetch show details
            const showDetails = await API.getShowDetails(showId);
            this.state.currentShow = showDetails;

            // Render show info
            UI.renderShowInfo(showDetails);

            // Load ALL seasons data
            const totalSeasons = showDetails.totalSeasons || 1;
            const allSeasons = [];

            // For shows with many seasons, load them sequentially (or in small batches)
            // to avoid saturating connections and causing timeouts
            for (let i = 1; i <= totalSeasons; i++) {
                try {
                    // Small delay every few seasons to be gentle on the connection
                    if (i > 1 && i % 3 === 1) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                    const episodes = await API.getSeasonEpisodes(showDetails, i);
                    allSeasons.push({ seasonNumber: i, episodes });
                } catch (e) {
                    console.error(`Failed to load season ${i}:`, e);
                    allSeasons.push({ seasonNumber: i, episodes: [] });
                }
            }

            this.state.seasonsData = allSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

            // Render all seasons in multi-column grid
            UI.renderAllSeasonsGrid(this.state.seasonsData);

            // Hide season tabs (no longer needed for multi-column view)
            UI.elements.seasonTabs.innerHTML = '';

            // Show results
            UI.showResults();

            // Scroll to results
            setTimeout(() => {
                UI.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);

        } catch (error) {
            console.error('Error loading show:', error);
            UI.showError(error.message || 'Failed to load show data. Please try again.');
        }
    },

    /**
     * Load a specific season's data
     * @param {number} seasonNumber - Season number to load
     */
    async loadSeason(seasonNumber) {
        if (!this.state.currentShow) return;

        this.state.currentSeason = seasonNumber;

        try {
            // Check if we already have this season's data cached
            let seasonData = this.state.seasonsData.find(s => s.seasonNumber === seasonNumber);

            if (!seasonData) {
                // Fetch season data
                const episodes = await API.getSeasonEpisodes(
                    this.state.currentShow,
                    seasonNumber
                );

                seasonData = {
                    seasonNumber: seasonNumber,
                    episodes: episodes
                };

                this.state.seasonsData.push(seasonData);
            }

            // Render ratings grid
            UI.renderRatingsGrid(seasonData.episodes, seasonNumber);

        } catch (error) {
            console.error('Error loading season:', error);
            UI.showToast('Failed to load season data', 'error');
        }
    },

    /**
     * Add a title to recent searches
     * @param {string} title - Show title
     */
    addToRecentSearches(title) {
        // Remove if already exists
        this.state.recentSearches = this.state.recentSearches.filter(s => s !== title);

        // Add to beginning
        this.state.recentSearches.unshift(title);

        // Keep only last 5
        this.state.recentSearches = this.state.recentSearches.slice(0, 5);

        // Save to localStorage
        this.saveRecentSearches();

        // Update UI
        this.renderRecentSearches();
    },

    /**
     * Load recent searches from localStorage
     */
    loadRecentSearches() {
        try {
            const stored = localStorage.getItem('cinematrix_recent');
            if (stored) {
                this.state.recentSearches = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading recent searches:', error);
            this.state.recentSearches = [];
        }
    },

    /**
     * Save recent searches to localStorage
     */
    saveRecentSearches() {
        try {
            localStorage.setItem('cinematrix_recent', JSON.stringify(this.state.recentSearches));
        } catch (error) {
            console.error('Error saving recent searches:', error);
        }
    },

    /**
     * Render recent searches in UI
     */
    renderRecentSearches() {
        UI.renderRecentSearches(this.state.recentSearches, async (title) => {
            UI.elements.searchInput.value = title;
            UI.updateClearButton(true);
            UI.hideSuggestions();

            // Show loading state immediately
            UI.showLoading();

            try {
                const results = await API.searchShows(title);
                if (results.length > 0) {
                    // Prioritize imdbID then tmdbID
                    const bestId = results[0].imdbID || results[0].tmdbID;
                    this.selectShow(bestId, results[0].title);
                } else {
                    UI.showError(`No results found for "${title}"`);
                }
            } catch (error) {
                console.error('Error searching recent:', error);
                UI.showError('Search failed. Please check your connection.');
            }
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for debugging
window.App = App;
