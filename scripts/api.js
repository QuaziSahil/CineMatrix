/* ===========================
   CineMatrix - Hybrid API Module
   Primary: IMDB/OMDB | Fallback: TMDB
   =========================== */

const API = {
    // OMDB API Configuration (IMDB data)
    OMDB_URL: 'https://www.omdbapi.com/',
    OMDB_KEY: '3c52f6d5',

    // TMDB API Configuration
    TMDB_URL: 'https://api.themoviedb.org/3',
    TMDB_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0YzJjMGNjNjM5N2ViYmQ3OTJkOGRmMzE4MjY4ZmIzOCIsIm5iZiI6MTc2Njk4ODU3OC4wNDE5OTk4LCJzdWIiOiI2OTUyMWIyMmM1Mjc4Y2IxYjU4OGRmOTciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.YgeumVwP3TOEgDn3wdUO04Ccsmq_SpKDkIsN5TT26EE',
    TMDB_IMAGE: 'https://image.tmdb.org/t/p',

    /**
     * Make TMDB API request with timeout
     */
    async tmdbRequest(endpoint, retries = 2) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        try {
            const response = await fetch(`${this.TMDB_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.TMDB_TOKEN}`,
                    'accept': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                // Retry for 5xx errors or rate limiting
                if (retries > 0 && (response.status >= 500 || response.status === 429)) {
                    await new Promise(r => setTimeout(r, 1000));
                    return this.tmdbRequest(endpoint, retries - 1);
                }
                const errorText = await response.text();
                console.error('TMDB API Error:', response.status, errorText);
                throw new Error(`TMDB Error: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            clearTimeout(timeout);
            if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
                // Retry for timeouts or network errors
                await new Promise(r => setTimeout(r, 1000));
                return this.tmdbRequest(endpoint, retries - 1);
            }
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - check your connection or VPN');
            }
            throw error;
        }
    },

    // Simple cache for API responses
    _cache: new Map(),

    /**
     * Make OMDB API request with timeout and caching
     */
    async omdbRequest(params, retries = 2) {
        // Check cache first
        if (this._cache.has(params)) {
            return this._cache.get(params);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        try {
            const url = `${this.OMDB_URL}?apikey=${this.OMDB_KEY}&${params}`;
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await response.json();

            // Cache successful responses
            if (data.Response !== 'False') {
                this._cache.set(params, data);
            }
            return data;
        } catch (error) {
            clearTimeout(timeout);
            if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
                await new Promise(r => setTimeout(r, 1000));
                return this.omdbRequest(params, retries - 1);
            }
            return { Response: 'False', Error: 'Request failed' };
        }
    },

    /**
     * Search for TV series - Uses TMDB for better coverage
     */
    async searchShows(query) {
        if (!query || query.trim().length < 2) return [];

        try {
            // Try OMDB first (User wants IMDB results first)
            const omdbSearch = await this.omdbRequest(`s=${encodeURIComponent(query)}&type=series`);

            if (omdbSearch.Response === 'True' && omdbSearch.Search) {
                return omdbSearch.Search.slice(0, 10).map(show => ({
                    imdbID: show.imdbID,
                    title: show.Title,
                    year: show.Year,
                    poster: show.Poster !== 'N/A' ? show.Poster : null,
                    type: 'series'
                }));
            }

            // Fallback: Try TMDB if OMDB finds nothing
            const tmdbData = await this.tmdbRequest(`/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`);

            if (tmdbData.results && tmdbData.results.length > 0) {
                return tmdbData.results.slice(0, 10).map(show => ({
                    tmdbID: show.id,
                    title: show.name,
                    year: show.first_air_date ? show.first_air_date.substring(0, 4) : 'N/A',
                    poster: show.poster_path ? `${this.TMDB_IMAGE}/w185${show.poster_path}` : null,
                    type: 'series',
                    rating: show.vote_average ? show.vote_average.toFixed(1) : null
                }));
            }
            return [];
        } catch (error) {
            console.error('Search error:', error);
            throw new Error('Failed to search shows. Check your connection.');
        }
    },

    /**
     * Get show details - IMDB first (priority), TMDB fallback
     */
    async getShowDetails(id) {
        try {
            // Handle IMDB ID vs TMDB ID
            if (String(id).startsWith('tt')) {
                // Primary: Fetch from OMDB (FAST)
                const omdbData = await this.omdbRequest(`i=${id}&plot=short`);

                if (omdbData.Response === 'True') {
                    return {
                        imdbID: id,
                        tmdbID: null, // We'll fetch if needed, but OMDB has enough for the matrix
                        title: omdbData.Title,
                        year: omdbData.Year,
                        poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
                        imdbRating: omdbData.imdbRating !== 'N/A' ? parseFloat(omdbData.imdbRating) : null,
                        imdbVotes: omdbData.imdbVotes !== 'N/A' ? omdbData.imdbVotes : null,
                        totalSeasons: parseInt(omdbData.totalSeasons) || 1,
                        status: omdbData.Type,
                        source: 'IMDB'
                    };
                }

                // If OMDB fails with ttID, resolve to TMDB as fallback
                const findData = await this.tmdbRequest(`/find/${id}?external_source=imdb_id`);
                if (findData.tv_results && findData.tv_results.length > 0) {
                    return this.getShowDetails(findData.tv_results[0].id);
                }
            } else {
                // Secondary: Fetch from TMDB if we only have TMDB ID
                const tmdbData = await this.tmdbRequest(`/tv/${id}?language=en-US`);
                const extData = await this.tmdbRequest(`/tv/${id}/external_ids`);
                const imdbID = extData.imdb_id;

                // If we got an IMDB ID, try to enrich with OMDB data
                if (imdbID) {
                    try {
                        const omdbData = await this.omdbRequest(`i=${imdbID}`);
                        if (omdbData.Response === 'True') {
                            return {
                                imdbID: imdbID,
                                tmdbID: id,
                                title: omdbData.Title,
                                year: omdbData.Year,
                                poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : (tmdbData.poster_path ? `${this.TMDB_IMAGE}/w342${tmdbData.poster_path}` : null),
                                imdbRating: omdbData.imdbRating !== 'N/A' ? parseFloat(omdbData.imdbRating) : null,
                                imdbVotes: omdbData.imdbVotes !== 'N/A' ? omdbData.imdbVotes : null,
                                totalSeasons: parseInt(omdbData.totalSeasons) || 1,
                                status: omdbData.Type,
                                source: 'IMDB'
                            };
                        }
                    } catch (e) { console.log('OMDB enrichment failed'); }
                }

                // Fallback to pure TMDB data
                return {
                    imdbID: imdbID || id,
                    tmdbID: id,
                    title: tmdbData.name,
                    year: tmdbData.first_air_date ? `${tmdbData.first_air_date.substring(0, 4)}–` : 'N/A',
                    poster: tmdbData.poster_path ? `${this.TMDB_IMAGE}/w342${tmdbData.poster_path}` : null,
                    imdbRating: tmdbData.vote_average,
                    imdbVotes: tmdbData.vote_count ? tmdbData.vote_count.toLocaleString() : null,
                    totalSeasons: tmdbData.number_of_seasons || 1,
                    status: tmdbData.status,
                    source: 'TMDB'
                };
            }
            throw new Error('Show details not found.');
        } catch (error) {
            console.error('Get show details error:', error);
            throw new Error(error.message || 'Failed to get show details.');
        }
    },

    /**
     * Get season episodes - IMDB ratings with TMDB fallback
     */
    async getSeasonEpisodes(showData, season) {
        const { imdbID, tmdbID } = showData;

        try {
            // Priority: Try OMDB for everything (FAST)
            if (imdbID && String(imdbID).startsWith('tt')) {
                const omdbData = await this.omdbRequest(`i=${imdbID}&Season=${season}`);
                if (omdbData.Response === 'True' && omdbData.Episodes) {
                    return omdbData.Episodes.map(ep => ({
                        episodeNumber: parseInt(ep.Episode),
                        title: ep.Title,
                        released: ep.Released,
                        imdbRating: ep.imdbRating !== 'N/A' ? parseFloat(ep.imdbRating) : null,
                        source: 'IMDB'
                    }));
                }
            }

            // Fallback: Use TMDB if OMDB fails
            if (tmdbID) {
                const tmdbSeason = await this.tmdbRequest(`/tv/${tmdbID}/season/${season}?language=en-US`);
                return (tmdbSeason.episodes || []).map(ep => ({
                    episodeNumber: ep.episode_number,
                    title: ep.name,
                    released: ep.air_date,
                    imdbRating: ep.vote_average,
                    source: 'TMDB'
                }));
            }

            return [];
        } catch (error) {
            console.error('Get season episodes error:', error);
            return [];
        }
    },

    /**
     * Get rating category based on score
     */
    getRatingCategory(rating) {
        if (rating === null || rating === undefined) {
            return { class: 'rating-na', label: 'N/A' };
        }

        if (rating >= 9.5) return { class: 'rating-absolute-cinema', label: 'Absolute Cinema' };
        if (rating >= 8.5) return { class: 'rating-awesome', label: 'Awesome' };
        if (rating >= 7.5) return { class: 'rating-great', label: 'Great' };
        if (rating >= 6.5) return { class: 'rating-good', label: 'Good' };
        if (rating >= 5.5) return { class: 'rating-regular', label: 'Regular' };
        if (rating >= 4.0) return { class: 'rating-bad', label: 'Bad' };
        return { class: 'rating-garbage', label: 'Garbage' };
    }
};

window.API = API;
