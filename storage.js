/**
 * STORAGE - Metadatos para Bibliotecas
 * Gestión de historial y favoritos con localStorage
 */

const Storage = {
    KEYS: {
        HISTORY: 'biblio_history',
        FAVORITES: 'biblio_favorites',
        SETTINGS: 'biblio_settings'
    },

    /**
     * Obtiene datos del localStorage
     */
    get(key, defaultValue = []) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Error reading localStorage:', e);
            return defaultValue;
        }
    },

    /**
     * Guarda datos en localStorage
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Error writing localStorage:', e);
            // Si está lleno, limpiar datos antiguos
            if (e.name === 'QuotaExceededError') {
                this.cleanup();
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    return true;
                } catch (e2) {
                    Utils.showToast('Espacio de almacenamiento lleno', 'error');
                    return false;
                }
            }
            return false;
        }
    },

    /**
     * Limpia datos antiguos si el storage está lleno
     */
    cleanup() {
        const history = this.getHistory();
        const favorites = this.getFavorites();
        
        // Mantener solo los 50 más recientes del historial
        if (history.length > 50) {
            this.set(this.KEYS.HISTORY, history.slice(-50));
        }
        
        // Limpiar descripciones largas de favoritos
        if (favorites.length > 0) {
            const trimmed = favorites.map(f => ({
                ...f,
                description: f.description ? f.description.substring(0, 500) : null
            }));
            this.set(this.KEYS.FAVORITES, trimmed);
        }
    },

    // ==================== HISTORIAL ====================

    getHistory() {
        return this.get(this.KEYS.HISTORY, []);
    },

    addHistory(query, type, resultsCount) {
        const history = this.getHistory();
        const entry = {
            id: Utils.generateId(),
            query: query.trim(),
            type: type,
            resultsCount: resultsCount,
            timestamp: Date.now()
        };

        // Evitar duplicados consecutivos
        const lastEntry = history[history.length - 1];
        if (lastEntry && lastEntry.query === entry.query && lastEntry.type === entry.type) {
            lastEntry.timestamp = entry.timestamp;
            lastEntry.resultsCount = entry.resultsCount;
            this.set(this.KEYS.HISTORY, history);
            return entry;
        }

        history.push(entry);
        
        // Limitar a 100 entradas
        if (history.length > 100) {
            history.shift();
        }
        
        this.set(this.KEYS.HISTORY, history);
        return entry;
    },

    removeHistory(id) {
        const history = this.getHistory().filter(h => h.id !== id);
        this.set(this.KEYS.HISTORY, history);
        return history;
    },

    clearHistory() {
        this.set(this.KEYS.HISTORY, []);
    },

    // ==================== FAVORITOS ====================

    getFavorites() {
        return this.get(this.KEYS.FAVORITES, []);
    },

    addFavorite(book) {
        const favorites = this.getFavorites();
        
        // Evitar duplicados por ISBN o título+autor
        const exists = favorites.some(f => {
            if (book.isbn && f.isbn === book.isbn) return true;
            if (book.doi && f.doi === book.doi) return true;
            return f.title === book.title && 
                   JSON.stringify(f.authors) === JSON.stringify(book.authors);
        });

        if (exists) {
            Utils.showToast('Este libro ya está en favoritos', 'warning');
            return false;
        }

        favorites.push({
            ...book,
            favoritedAt: Date.now()
        });
        
        this.set(this.KEYS.FAVORITES, favorites);
        Utils.showToast('Agregado a favoritos', 'success');
        return true;
    },

    removeFavorite(id) {
        const favorites = this.getFavorites().filter(f => f.id !== id);
        this.set(this.KEYS.FAVORITES, favorites);
        Utils.showToast('Eliminado de favoritos', 'info');
        return favorites;
    },

    isFavorite(id) {
        return this.getFavorites().some(f => f.id === id);
    },

    toggleFavorite(book) {
        if (this.isFavorite(book.id)) {
            this.removeFavorite(book.id);
            return false;
        } else {
            this.addFavorite(book);
            return true;
        }
    },

    clearFavorites() {
        this.set(this.KEYS.FAVORITES, []);
    },

    // ==================== SETTINGS ====================

    getSettings() {
        return this.get(this.KEYS.SETTINGS, {
            multiSource: true,
            defaultFormat: 'bibtex'
        });
    },

    saveSettings(settings) {
        const current = this.getSettings();
        this.set(this.KEYS.SETTINGS, { ...current, ...settings });
    }
};
