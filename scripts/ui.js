/* ===========================
   SeriesGraph - UI Module
   DOM Manipulation & Rendering
   =========================== */

const UI = {
    // DOM Element Cache
    elements: {},

    /**
     * Initialize UI by caching DOM elements
     */
    init() {
        this.elements = {
            // Search
            searchInput: document.getElementById('searchInput'),
            clearSearch: document.getElementById('clearSearch'),
            searchSuggestions: document.getElementById('searchSuggestions'),
            recentSearches: document.getElementById('recentSearches'),
            recentTags: document.getElementById('recentTags'),

            // Loading & Error
            loadingContainer: document.getElementById('loadingContainer'),
            errorContainer: document.getElementById('errorContainer'),
            errorText: document.getElementById('errorText'),

            // Results
            resultsSection: document.getElementById('resultsSection'),
            seasonTabs: document.getElementById('seasonTabs'),
            graphCard: document.getElementById('graphCard'),

            // Show Info
            showPoster: document.getElementById('showPoster'),
            showRating: document.getElementById('showRating'),
            showVotes: document.getElementById('showVotes'),
            showTitle: document.getElementById('showTitle'),
            showYear: document.getElementById('showYear'),
            ratingsGrid: document.getElementById('ratingsGrid'),

            // Actions
            downloadFormat: document.getElementById('downloadFormat'),
            downloadBtn: document.getElementById('downloadBtn'),
            shareBtn: document.getElementById('shareBtn'),

            // Modal
            aboutModal: document.getElementById('aboutModal'),
            aboutBtn: document.getElementById('aboutBtn'),
            closeModal: document.getElementById('closeModal'),

            // Toast
            toast: document.getElementById('toast'),
            toastMessage: document.getElementById('toastMessage'),

            // Average Rating
            avgRating: document.getElementById('avgRating')
        };
    },

    /**
     * Show loading state
     */
    showLoading() {
        this.elements.loadingContainer.style.display = 'flex';
        this.elements.errorContainer.style.display = 'none';
        this.elements.resultsSection.style.display = 'none';
    },

    /**
     * Hide loading state
     */
    hideLoading() {
        this.elements.loadingContainer.style.display = 'none';
    },

    /**
     * Show error state
     * @param {string} message - Error message to display
     */
    showError(message) {
        this.elements.loadingContainer.style.display = 'none';
        this.elements.resultsSection.style.display = 'none';
        this.elements.errorContainer.style.display = 'flex';
        this.elements.errorText.textContent = message;
    },

    /**
     * Show results section
     */
    showResults() {
        this.elements.loadingContainer.style.display = 'none';
        this.elements.errorContainer.style.display = 'none';
        this.elements.resultsSection.style.display = 'block';
        this.elements.resultsSection.classList.add('animate-fadeInUp');
    },

    /**
     * Show search suggestions
     * @param {Array} shows - Array of show results
     * @param {Function} onSelect - Callback when a show is selected
     */
    showSuggestions(shows, onSelect) {
        if (shows.length === 0) {
            this.hideSuggestions();
            return;
        }

        const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="56" fill="%23333"%3E%3Crect width="40" height="56"/%3E%3C/svg%3E';

        const html = shows.slice(0, 6).map(show => {
            const poster = show.poster || placeholder;
            const title = show.title.replace(/"/g, '&quot;');
            const id = show.imdbID || show.tmdbID;
            return `
                <div class="suggestion-item" data-id="${id}" data-title="${title}">
                    <img src="${poster}" alt="${title}" class="suggestion-poster" onerror="this.style.background='#333'">
                    <div class="suggestion-info">
                        <div class="suggestion-title">${show.title}</div>
                        <div class="suggestion-year">${show.year}</div>
                    </div>
                    <span class="suggestion-type">Series</span>
                </div>
            `;
        }).join('');

        this.elements.searchSuggestions.innerHTML = html;
        this.elements.searchSuggestions.classList.add('active');

        // Add click handlers
        this.elements.searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const title = item.dataset.title;
                onSelect(id, title);
                this.hideSuggestions();
            });
        });
    },

    /**
     * Hide search suggestions
     */
    hideSuggestions() {
        this.elements.searchSuggestions.classList.remove('active');
        this.elements.searchSuggestions.innerHTML = '';
    },

    /**
     * Update clear button visibility
     * @param {boolean} show - Whether to show the clear button
     */
    updateClearButton(show) {
        this.elements.clearSearch.style.display = show ? 'flex' : 'none';
    },

    /**
     * Render recent searches
     * @param {Array} searches - Array of recent search strings
     * @param {Function} onClick - Callback when a tag is clicked
     */
    renderRecentSearches(searches, onClick) {
        if (searches.length === 0) {
            this.elements.recentSearches.style.display = 'none';
            return;
        }

        this.elements.recentSearches.style.display = 'flex';
        this.elements.recentTags.innerHTML = searches.slice(0, 5).map(search => `
            <button class="recent-tag" data-search="${search}">${search}</button>
        `).join('');

        // Add click handlers
        this.elements.recentTags.querySelectorAll('.recent-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                onClick(tag.dataset.search);
            });
        });
    },

    /**
     * Render season tabs
     * @param {number} totalSeasons - Total number of seasons
     * @param {number} activeSeason - Currently active season
     * @param {Function} onSelect - Callback when a season is selected
     */
    renderSeasonTabs(totalSeasons, activeSeason, onSelect) {
        let html = '';

        for (let i = 1; i <= totalSeasons; i++) {
            const isActive = i === activeSeason ? 'active' : '';
            html += `<button class="season-tab ${isActive}" data-season="${i}">S${i}</button>`;
        }

        this.elements.seasonTabs.innerHTML = html;

        // Add click handlers
        this.elements.seasonTabs.querySelectorAll('.season-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const season = parseInt(tab.dataset.season);

                // Update active state
                this.elements.seasonTabs.querySelectorAll('.season-tab').forEach(t => {
                    t.classList.remove('active');
                });
                tab.classList.add('active');

                onSelect(season);
            });
        });
    },

    /**
     * Convert image URL to base64 using canvas
     * @param {string} url - Image URL
     * @returns {Promise<string>} - Base64 data URL or original URL on failure
     */
    async loadImageAsBase64(url) {
        return new Promise((resolve) => {
            if (!url || url.startsWith('data:')) {
                resolve(url);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    resolve(dataUrl);
                } catch (e) {
                    console.log('Canvas conversion failed, using original URL');
                    resolve(url);
                }
            };

            img.onerror = () => {
                // If CORS fails, try loading without crossOrigin
                const fallbackImg = new Image();
                fallbackImg.onload = () => resolve(url);
                fallbackImg.onerror = () => resolve(url);
                fallbackImg.src = url;
            };

            // Add cache buster to avoid cached non-CORS response
            const separator = url.includes('?') ? '&' : '?';
            img.src = url + separator + '_t=' + Date.now();
        });
    },

    /**
     * Render show info card
     * @param {Object} show - Show data object
     */
    async renderShowInfo(show) {
        // Set placeholder first
        this.elements.showPoster.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="270" fill="%23222"><rect width="180" height="270"/></svg>';
        this.elements.showPoster.alt = show.title;
        this.elements.showTitle.textContent = show.title;
        this.elements.showYear.textContent = show.year;

        // Try to load image as base64 for download support
        if (show.poster) {
            try {
                const base64 = await this.loadImageAsBase64(show.poster);
                this.elements.showPoster.src = base64;
            } catch (e) {
                // Fallback to original URL
                this.elements.showPoster.src = show.poster;
            }
        }

        // Update rating display
        const ratingValue = document.getElementById('showRating');
        const votesDisplay = document.getElementById('showVotes');
        const sourceTag = document.getElementById('ratingSource');

        if (ratingValue) {
            ratingValue.textContent = show.imdbRating ? show.imdbRating.toFixed(1) : 'N/A';
        }
        if (votesDisplay) {
            votesDisplay.textContent = show.imdbVotes ? `(${show.imdbVotes})` : '';
        }
        if (sourceTag) {
            sourceTag.textContent = show.source || 'IMDB';
            sourceTag.className = `rating-source-tag ${(show.source || 'IMDB').toLowerCase()}`;
        }
    },

    /**
     * Render episode ratings grid
     * @param {Array} episodes - Array of episode objects with ratings
     * @param {number} seasonNumber - Current season number
     */
    renderRatingsGrid(episodes, seasonNumber) {
        const html = `
            <div class="season-column">
                <div class="season-header">S${seasonNumber}</div>
                ${episodes.map(ep => {
            const category = API.getRatingCategory(ep.imdbRating);
            const ratingText = ep.imdbRating !== null ? ep.imdbRating.toFixed(1) : 'N/A';
            return `
                        <div class="episode-row">
                            <span class="episode-label">E${ep.episodeNumber}</span>
                            <div class="episode-rating ${category.class}" title="${ep.title}">
                                ${ratingText}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        this.elements.ratingsGrid.innerHTML = html;

        // Update average rating
        const avg = this.calculateAverageRating(episodes);
        if (avg !== null && this.elements.avgRating) {
            this.elements.avgRating.querySelector('.avg-value').textContent = avg.toFixed(1);
        }

        // Add entrance animation
        this.elements.ratingsGrid.classList.add('animate-fadeIn');
    },

    /**
     * Render all seasons ratings in MATRIX layout (episodes as rows, seasons as columns)
     * @param {Array} seasonsData - Array of season objects with episodes
     */
    renderAllSeasonsGrid(seasonsData) {
        // Find max episodes across all seasons
        const maxEpisodes = Math.max(...seasonsData.map(s => s.episodes.length));

        // Build season headers row
        let html = '<div class="matrix-header">';
        seasonsData.forEach((season, idx) => {
            html += `<div class="season-label">S${season.seasonNumber}</div>`;
        });
        html += '</div>';

        // Build episode rows
        for (let epNum = 1; epNum <= maxEpisodes; epNum++) {
            html += `<div class="matrix-row">`;
            html += `<span class="episode-label">E${epNum}</span>`;

            seasonsData.forEach(season => {
                const episode = season.episodes.find(ep => ep.episodeNumber === epNum);

                if (episode) {
                    const category = API.getRatingCategory(episode.imdbRating);
                    const ratingText = episode.imdbRating !== null
                        ? episode.imdbRating.toFixed(1)
                        : 'N/A';
                    const cellClass = episode.imdbRating !== null
                        ? category.class.replace('rating-', '')
                        : 'na';
                    html += `<div class="matrix-cell ${cellClass}" title="${episode.title}">${ratingText}</div>`;
                } else {
                    // Empty cell for seasons that don't have this episode
                    html += `<div class="matrix-cell na">-</div>`;
                }
            });

            html += '</div>';
        }

        this.elements.ratingsGrid.innerHTML = html;

        // Calculate overall average from all episodes
        const allEpisodes = seasonsData.flatMap(s => s.episodes);
        const ratedEpisodes = allEpisodes.filter(ep => ep.imdbRating !== null);
        const naPercentage = ((allEpisodes.length - ratedEpisodes.length) / allEpisodes.length) * 100;

        // Show warning if more than 50% of episodes have N/A
        const warningContainer = document.getElementById('dataWarning');
        if (warningContainer) {
            if (naPercentage > 50) {
                warningContainer.innerHTML = `
                    <span class="data-warning-icon">⚠️</span>
                    <span>Limited data (${Math.round(naPercentage)}% N/A) - some episodes not yet rated</span>
                `;
                warningContainer.style.display = 'flex';
            } else {
                warningContainer.style.display = 'none';
            }
        }
    },

    /**
     * Show about modal
     */
    showAboutModal() {
        this.elements.aboutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    /**
     * Hide about modal
     */
    hideAboutModal() {
        this.elements.aboutModal.classList.remove('active');
        document.body.style.overflow = '';
    },

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type of toast (success, error)
     */
    showToast(message, type = 'success') {
        const icon = type === 'success' ? '✓' : '✕';
        this.elements.toast.querySelector('.toast-icon').textContent = icon;
        this.elements.toastMessage.textContent = message;
        this.elements.toast.classList.add('active');

        // Auto hide after 3 seconds
        setTimeout(() => {
            this.hideToast();
        }, 3000);
    },

    /**
     * Hide toast notification
     */
    hideToast() {
        this.elements.toast.classList.remove('active');
    },

    /**
     * Calculate average rating for a season
     * @param {Array} episodes - Array of episode objects
     * @returns {number|null} - Average rating or null
     */
    calculateAverageRating(episodes) {
        const validRatings = episodes.filter(ep => ep.imdbRating !== null);
        if (validRatings.length === 0) return null;

        const sum = validRatings.reduce((acc, ep) => acc + ep.imdbRating, 0);
        return sum / validRatings.length;
    }
};

// Export for use in other modules
window.UI = UI;
