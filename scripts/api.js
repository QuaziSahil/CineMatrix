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
        try {
            console.log(`[CineMatrix] Fetching TMDB: ${endpoint}`); // Debug log
            const response = await fetch(`${this.TMDB_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.TMDB_TOKEN}`,
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                // Retry for 5xx errors or rate limiting
                if (retries > 0 && (response.status >= 500 || response.status === 429)) {
                    await new Promise(r => setTimeout(r, 1000));
                    return this.tmdbRequest(endpoint, retries - 1);
                }
                const errorText = await response.text();
                // If 429, we still throw to handled logic
                if (response.status === 429) throw new Error('429 Too Many Requests');

                console.error('TMDB API Error:', response.status, errorText);
                throw new Error(`TMDB Error: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            if (retries > 0) {
                // Retry for network errors
                await new Promise(r => setTimeout(r, 1000));
                return this.tmdbRequest(endpoint, retries - 1);
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

        try {
            const url = `${this.OMDB_URL}?apikey=${this.OMDB_KEY}&${params}`;
            console.log(`[CineMatrix] Fetching OMDB: ${params}`); // Debug log
            const response = await fetch(url);
            const data = await response.json();

            // Cache successful responses
            if (data.Response !== 'False') {
                this._cache.set(params, data);
            }
            return data;
        } catch (error) {
            console.error(`[CineMatrix] OMDB Failed:`, error);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 1000));
                return this.omdbRequest(params, retries - 1);
            }
            return { Response: 'False', Error: 'Request failed' };
        }
    },

    /**
     * Search for TV series - Uses OMDB primary, TMDB fallback
     */
    async searchShows(query) {
        if (!query || query.trim().length < 2) return [];

        try {
            // Try OMDB first
            const omdbSearch = await this.omdbRequest(`s=${encodeURIComponent(query)}&type=series`);

            if (omdbSearch.Response === 'True' && omdbSearch.Search) {
                return omdbSearch.Search.slice(0, 10).map(show => ({
                    imdbID: show.imdbID,
                    title: show.Title,
                    year: show.Year,
                    poster: show.Poster !== 'N/A' ? show.Poster : null,
                    type: 'series',
                    source: 'OMDB'
                }));
            }

            console.log('OMDB search returned no results or failed, trying TMDB...');

            // Fallback: Try TMDB
            const tmdbData = await this.tmdbRequest(`/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`);

            if (tmdbData.results && tmdbData.results.length > 0) {
                return tmdbData.results.slice(0, 10).map(show => ({
                    tmdbID: show.id,
                    title: show.name,
                    year: show.first_air_date ? show.first_air_date.substring(0, 4) : 'N/A',
                    poster: show.poster_path ? `${this.TMDB_IMAGE}/w185${show.poster_path}` : null,
                    type: 'series',
                    rating: show.vote_average ? show.vote_average.toFixed(1) : null,
                    source: 'TMDB'
                }));
            }
            return [];
        } catch (error) {
            console.error('Search error:', error);
            if (error.message.includes('429')) {
                throw new Error('Too many requests. Please wait a moment.');
            }
            throw new Error('Search failed. Please check your connection.');
        }
    },

    /**
     * Get show details - Hybrid merging
     */
    async getShowDetails(id, title = null) {
        try {
            let result = null;

            // 1. Try OMDB by ID if provided
            if (id && String(id).startsWith('tt')) {
                const omdbData = await this.omdbRequest(`i=${id}&plot=short`);
                if (omdbData.Response === 'True') {
                    result = this._formatOmdbShow(omdbData, id);
                }
            }

            // 2. Try OMDB by Title if ID failed/not provided
            if (!result && title) {
                const omdbSearch = await this.omdbRequest(`t=${encodeURIComponent(title)}`);
                if (omdbSearch.Response === 'True' && omdbSearch.imdbID) {
                    result = this._formatOmdbShow(omdbSearch, omdbSearch.imdbID, id);
                }
            }

            // 3. Resolve TMDB ID for episode fallback support if missing
            if (result && !result.tmdbID && result.imdbID) {
                try {
                    const findData = await this.tmdbRequest(`/find/${result.imdbID}?external_source=imdb_id`);
                    if (findData.tv_results && findData.tv_results.length > 0) {
                        result.tmdbID = findData.tv_results[0].id;
                    }
                } catch (e) {
                    console.log('TMDB resolution delayed or failed');
                }
            }

            // 4. Fallback to TMDB if OMDB completely failed
            if (!result) {
                console.log('OMDB resolution failed, falling back to TMDB lookup...');
                const tmdbID = (id && String(id).startsWith('tt')) ? null : id;

                if (tmdbID) {
                    const tmdbData = await this.tmdbRequest(`/tv/${tmdbID}?language=en-US`);
                    const extData = await this.tmdbRequest(`/tv/${tmdbID}/external_ids`);
                    const imdbID = extData.imdb_id;

                    if (imdbID) {
                        const omdbData = await this.omdbRequest(`i=${imdbID}`);
                        if (omdbData.Response === 'True') {
                            return this._formatOmdbShow(omdbData, imdbID, tmdbID);
                        }
                    }

                    return {
                        imdbID: imdbID || tmdbID,
                        tmdbID: tmdbID,
                        title: tmdbData.name,
                        year: tmdbData.first_air_date ? tmdbData.first_air_date.substring(0, 4) : 'N/A',
                        poster: tmdbData.poster_path ? `${this.TMDB_IMAGE}/w342${tmdbData.poster_path}` : null,
                        imdbRating: tmdbData.vote_average,
                        imdbVotes: tmdbData.vote_count ? tmdbData.vote_count.toLocaleString() : null,
                        totalSeasons: tmdbData.number_of_seasons || 1,
                        status: tmdbData.status,
                        source: 'TMDB'
                    };
                }
            }

            if (result) return result;
            throw new Error('Show details not found.');
        } catch (error) {
            console.error('Get show details error:', error);
            throw new Error(error.message || 'Failed to get show details.');
        }
    },

    /**
     * Internal helper to format OMDB response
     */
    _formatOmdbShow(omdbData, imdbID, tmdbID = null) {
        return {
            imdbID: imdbID,
            tmdbID: tmdbID,
            title: omdbData.Title,
            year: omdbData.Year,
            poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
            imdbRating: omdbData.imdbRating !== 'N/A' ? parseFloat(omdbData.imdbRating) : null,
            imdbVotes: omdbData.imdbVotes !== 'N/A' ? omdbData.imdbVotes : null,
            totalSeasons: parseInt(omdbData.totalSeasons) || 1,
            status: omdbData.Type,
            source: 'IMDB'
        };
    },

    /**
     * Get season episodes - Hybrid merging with zero N/As
     */
    async getSeasonEpisodes(showData, season) {
        let { imdbID, tmdbID } = showData;

        try {
            // Resolve TMDB ID for fallback if missing
            if (!tmdbID && imdbID) {
                try {
                    const findData = await this.tmdbRequest(`/find/${imdbID}?external_source=imdb_id`);
                    if (findData.tv_results && findData.tv_results.length > 0) {
                        tmdbID = findData.tv_results[0].id;
                        showData.tmdbID = tmdbID;
                    }
                } catch (e) {
                    console.log('Failed to resolve TMDB ID for fallback');
                }
            }

            // Fetch both in parallel
            const requests = [
                imdbID ? this.omdbRequest(`i=${imdbID}&Season=${season}`) : Promise.resolve(null),
                tmdbID ? this.tmdbRequest(`/tv/${tmdbID}/season/${season}?language=en-US`) : Promise.resolve(null)
            ];

            const [omdbData, tmdbData] = await Promise.all(requests);

            const omdbEpisodes = (omdbData && omdbData.Response === 'True' && omdbData.Episodes) ? omdbData.Episodes : [];
            const tmdbEpisodes = (tmdbData && tmdbData.episodes) ? tmdbData.episodes : [];

            // Merge: Use TMDB structure as base
            if (tmdbEpisodes.length > 0) {
                return tmdbEpisodes.map(tmdbEp => {
                    const omdbEp = omdbEpisodes.find(o => parseInt(o.Episode) === tmdbEp.episode_number);

                    let rating = null;
                    let source = 'TMDB';

                    // Prefer IMDB rating if valid
                    if (omdbEp && omdbEp.imdbRating !== 'N/A') {
                        rating = parseFloat(omdbEp.imdbRating);
                        source = 'IMDB';
                    } else if (tmdbEp.vote_average && tmdbEp.vote_count > 0) {
                        rating = parseFloat(tmdbEp.vote_average.toFixed(1));
                        source = 'TMDB';
                    }

                    return {
                        episodeNumber: tmdbEp.episode_number,
                        title: tmdbEp.name,
                        released: tmdbEp.air_date,
                        imdbRating: rating,
                        source: source
                    };
                });
            }

            // Fallback to pure OMDB
            if (omdbEpisodes.length > 0) {
                return omdbEpisodes.map(ep => ({
                    episodeNumber: parseInt(ep.Episode),
                    title: ep.Title,
                    released: ep.Released,
                    imdbRating: ep.imdbRating !== 'N/A' ? parseFloat(ep.imdbRating) : null,
                    source: 'IMDB'
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
