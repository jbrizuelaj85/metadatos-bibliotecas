/**
 * APP - Metadatos para Bibliotecas
 * Lógica principal: navegación, búsqueda, resultados
 */

// ==================== ESTADO GLOBAL ====================
const App = {
    currentTab: 'isbn',
    isSearching: false,
    currentResults: [],
    
    // ==================== INICIALIZACIÓN ====================
    init() {
        this.setupNavigation();
        this.setupSearchTabs();
        this.setupSearchInput();
        this.setupExamples();
        this.setupModal();
        this.setupHistory();
        this.setupFavorites();
        this.loadHistory();
        this.loadFavorites();
        
        // Cargar configuración
        const settings = Storage.getSettings();
        document.getElementById('multiSource').checked = settings.multiSource;
    },

    // ==================== NAVEGACIÓN ====================
    setupNavigation() {
        const menuToggle = document.getElementById('menuToggle');
        const mainNav = document.getElementById('mainNav');
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.section');

        // Toggle menú móvil
        menuToggle?.addEventListener('click', () => {
            mainNav.classList.toggle('active');
            const icon = menuToggle.querySelector('.icon');
            icon.textContent = mainNav.classList.contains('active') ? '✕' : '☰';
        });

        // Navegación entre secciones
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                
                // Actualizar nav activo
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                // Mostrar sección
                sections.forEach(s => s.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');
                
                // Cerrar menú móvil
                mainNav.classList.remove('active');
                const icon = menuToggle.querySelector('i');
                icon.classList.add('fa-bars');
                icon.classList.remove('fa-times');
                
                // Scroll al inicio
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                // Recargar datos si es necesario
                if (targetId === 'historial') this.loadHistory();
                if (targetId === 'favoritos') this.loadFavorites();
            });
        });
    },

    // ==================== TABS DE BÚSQUEDA ====================
    setupSearchTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const searchInput = document.getElementById('searchInput');
        
        const placeholders = {
            isbn: 'Ingresa ISBN (10 o 13 dígitos)...',
            titulo: 'Ingresa el título del libro...',
            autor: 'Ingresa el nombre del autor...',
            doi: 'Ingresa el DOI (ej: 10.xxxx/xxxxx)...'
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                searchInput.placeholder = placeholders[this.currentTab];
                searchInput.value = '';
                searchInput.focus();
            });
        });
    },

    // ==================== INPUT DE BÚSQUEDA ====================
    setupSearchInput() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const clearBtn = document.getElementById('clearBtn');

        // Buscar al presionar Enter
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Botón buscar
        searchBtn.addEventListener('click', () => this.performSearch());

        // Botón limpiar
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            this.clearResults();
            searchInput.focus();
        });

        // Auto-detectar tipo de búsqueda
        searchInput.addEventListener('input', Utils.debounce((e) => {
            const detected = Utils.detectQueryType(e.target.value);
            if (detected && detected !== this.currentTab) {
                const tabBtn = document.querySelector(`.tab-btn[data-tab="${detected}"]`);
                if (tabBtn) tabBtn.click();
            }
        }, 300));
    },

    // ==================== EJEMPLOS ====================
    setupExamples() {
        document.querySelectorAll('.example-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                const type = tag.dataset.type;
                const value = tag.dataset.value;
                
                // Activar tab correspondiente
                document.querySelector(`.tab-btn[data-tab="${type}"]`)?.click();
                
                // Llenar input y buscar
                const searchInput = document.getElementById('searchInput');
                searchInput.value = value;
                this.performSearch();
            });
        });
    },

    // ==================== BÚSQUEDA ====================
    async performSearch() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();
        
        if (!query) {
            Utils.showToast('Ingresa un término de búsqueda', 'warning');
            return;
        }

        if (this.isSearching) return;
        this.isSearching = true;

        const multiSource = document.getElementById('multiSource').checked;
        
        // Mostrar loading
        this.showLoading(true);
        this.clearResults();
        
        try {
            let results = [];
            
            if (multiSource) {
                // Buscar en múltiples fuentes en paralelo
                const promises = [];
                
                if (this.currentTab === 'doi') {
                    promises.push(this.searchCrossRef(query));
                } else {
                    promises.push(this.searchGoogleBooks(query, this.currentTab));
                    promises.push(this.searchOpenLibrary(query, this.currentTab));
                    if (this.currentTab === 'isbn') {
                        promises.push(this.searchCrossRef(query));
                    }
                }
                
                const responses = await Promise.allSettled(promises);
                const allResults = [];
                
                responses.forEach((response, index) => {
                    if (response.status === 'fulfilled' && response.value) {
                        allResults.push(...response.value);
                    }
                });
                
                // Eliminar duplicados y ordenar
                results = this.deduplicateResults(allResults);
            } else {
                // Buscar solo en Google Books
                results = await this.searchGoogleBooks(query, this.currentTab);
            }
            
            this.currentResults = results;
            
            // Guardar en historial
            Storage.addHistory(query, this.currentTab, results.length);
            
            // Mostrar resultados
            this.displayResults(results);
            
            if (results.length === 0) {
                Utils.showToast('No se encontraron resultados', 'warning');
            } else {
                Utils.showToast(`${results.length} resultado(s) encontrado(s)`, 'success');
            }
            
        } catch (error) {
            console.error('Search error:', error);
            Utils.showToast('Error al realizar la búsqueda', 'error');
        } finally {
            this.showLoading(false);
            this.isSearching = false;
        }
    },

    // ==================== APIs ====================
    
    async searchGoogleBooks(query, type) {
        this.updateSourceIndicator('google', 'searching');
        
        try {
            let searchQuery = query;
            if (type === 'isbn') searchQuery = `isbn:${Utils.cleanISBN(query)}`;
            else if (type === 'autor') searchQuery = `inauthor:"${query}"`;
            else if (type === 'titulo') searchQuery = `intitle:"${query}"`;
            
            const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=10&langRestrict=es`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                this.updateSourceIndicator('google', 'not-found');
                return [];
            }
            
            const results = data.items.map(item => {
                const info = item.volumeInfo || {};
                const ids = info.industryIdentifiers || [];
                const isbn13 = ids.find(id => id.type === 'ISBN_13')?.identifier;
                const isbn10 = ids.find(id => id.type === 'ISBN_10')?.identifier;
                
                return Utils.normalizeBook({
                    id: item.id || Utils.generateId(),
                    title: info.title,
                    subtitle: info.subtitle,
                    authors: info.authors,
                    publisher: info.publisher,
                    publishedDate: info.publishedDate,
                    isbn: isbn13 || isbn10,
                    isbn13: isbn13,
                    isbn10: isbn10,
                    pageCount: info.pageCount,
                    language: info.language,
                    categories: info.categories,
                    description: info.description,
                    coverUrl: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail,
                    infoLink: info.infoLink,
                    previewLink: info.previewLink,
                    source: 'google'
                }, 'Google Books');
            });
            
            this.updateSourceIndicator('google', 'found');
            return results;
            
        } catch (error) {
            console.error('Google Books error:', error);
            this.updateSourceIndicator('google', 'not-found');
            return [];
        }
    },

    async searchOpenLibrary(query, type) {
        this.updateSourceIndicator('openlib', 'searching');
        
        try {
            let url;
            if (type === 'isbn') {
                const cleanISBN = Utils.cleanISBN(query);
                url = `https://openlibrary.org/isbn/${cleanISBN}.json`;
            } else if (type === 'autor') {
                url = `https://openlibrary.org/search.json?author=${encodeURIComponent(query)}&limit=10`;
            } else {
                url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`;
            }
            
            const response = await fetch(url);
            
            if (type === 'isbn') {
                if (!response.ok) {
                    this.updateSourceIndicator('openlib', 'not-found');
                    return [];
                }
                const data = await response.json();
                
                // Obtener datos del autor
                let authors = [];
                if (data.authors) {
                    for (const author of data.authors.slice(0, 3)) {
                        try {
                            const authorRes = await fetch(`https://openlibrary.org${author.key}.json`);
                            const authorData = await authorRes.json();
                            authors.push(authorData.name);
                        } catch (e) { /* ignore */ }
                    }
                }
                
                const result = Utils.normalizeBook({
                    id: data.key || Utils.generateId(),
                    title: data.title,
                    authors: authors.length > 0 ? authors : data.author_name,
                    publisher: data.publishers?.[0],
                    publishedDate: data.publish_date || data.first_publish_date,
                    isbn: data.isbn_13?.[0] || data.isbn_10?.[0],
                    isbn13: data.isbn_13?.[0],
                    isbn10: data.isbn_10?.[0],
                    pageCount: data.number_of_pages,
                    language: data.languages?.[0]?.key?.replace('/languages/', ''),
                    categories: data.subjects,
                    description: typeof data.description === 'string' ? data.description : data.description?.value,
                    coverUrl: data.covers ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg` : null,
                    infoLink: `https://openlibrary.org${data.key}`,
                    source: 'Open Library'
                }, 'Open Library');
                
                this.updateSourceIndicator('openlib', 'found');
                return [result];
            } else {
                const data = await response.json();
                
                if (!data.docs || data.docs.length === 0) {
                    this.updateSourceIndicator('openlib', 'not-found');
                    return [];
                }
                
                const results = data.docs.slice(0, 10).map(doc => 
                    Utils.normalizeBook({
                        id: doc.key || Utils.generateId(),
                        title: doc.title,
                        authors: doc.author_name,
                        publisher: doc.publisher?.[0],
                        publishedDate: doc.first_publish_year?.toString() || doc.publish_date?.[0],
                        isbn: doc.isbn?.[0],
                        isbn13: doc.isbn?.find(i => i.length === 13),
                        isbn10: doc.isbn?.find(i => i.length === 10),
                        pageCount: doc.number_of_pages_median,
                        language: doc.language?.[0],
                        categories: doc.subject,
                        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
                        infoLink: `https://openlibrary.org${doc.key}`,
                        source: 'Open Library'
                    }, 'Open Library')
                );
                
                this.updateSourceIndicator('openlib', 'found');
                return results;
            }
            
        } catch (error) {
            console.error('Open Library error:', error);
            this.updateSourceIndicator('openlib', 'not-found');
            return [];
        }
    },

    async searchCrossRef(query) {
        this.updateSourceIndicator('crossref', 'searching');
        
        try {
            // Para DOI directo
            if (this.currentTab === 'doi' || query.startsWith('10.')) {
                const doi = query.replace(/^doi:/i, '').trim();
                const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    this.updateSourceIndicator('crossref', 'not-found');
                    return [];
                }
                
                const data = await response.json();
                const work = data.message;
                
                const result = Utils.normalizeBook({
                    id: work.DOI || Utils.generateId(),
                    title: Array.isArray(work.title) ? work.title[0] : work.title,
                    authors: (work.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()),
                    publisher: work.publisher,
                    publishedDate: work.published?.['date-parts']?.[0]?.join('-') || work.created?.['date-time'],
                    isbn: work.ISBN?.[0],
                    pageCount: work.page,
                    language: work.language,
                    categories: work.subject,
                    description: work.abstract ? work.abstract.replace(/<[^>]*>/g, '') : null,
                    infoLink: work.URL || `https://doi.org/${work.DOI}`,
                    doi: work.DOI,
                    source: 'CrossRef'
                }, 'CrossRef');
                
                this.updateSourceIndicator('crossref', 'found');
                return [result];
            }
            
            // Para ISBN
            if (this.currentTab === 'isbn') {
                const url = `https://api.crossref.org/works?filter=isbn:${encodeURIComponent(Utils.cleanISBN(query))}&rows=5`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (!data.message?.items || data.message.items.length === 0) {
                    this.updateSourceIndicator('crossref', 'not-found');
                    return [];
                }
                
                const results = data.message.items.map(work => 
                    Utils.normalizeBook({
                        id: work.DOI || Utils.generateId(),
                        title: Array.isArray(work.title) ? work.title[0] : work.title,
                        authors: (work.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()),
                        publisher: work.publisher,
                        publishedDate: work.published?.['date-parts']?.[0]?.join('-'),
                        isbn: work.ISBN?.[0],
                        pageCount: work.page,
                        language: work.language,
                        categories: work.subject,
                        description: work.abstract ? work.abstract.replace(/<[^>]*>/g, '') : null,
                        infoLink: work.URL || `https://doi.org/${work.DOI}`,
                        doi: work.DOI,
                        source: 'CrossRef'
                    }, 'CrossRef')
                );
                
                this.updateSourceIndicator('crossref', 'found');
                return results;
            }
            
            this.updateSourceIndicator('crossref', 'not-found');
            return [];
            
        } catch (error) {
            console.error('CrossRef error:', error);
            this.updateSourceIndicator('crossref', 'not-found');
            return [];
        }
    },

    // ==================== UTILIDADES DE RESULTADOS ====================
    
    deduplicateResults(results) {
        const seen = new Set();
        return results.filter(book => {
            const key = book.isbn || `${book.title}|${(book.authors || []).join(',')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    updateSourceIndicator(source, state) {
        const indicator = document.querySelector(`.source-indicator[data-source="${source}"]`);
        if (indicator) {
            indicator.classList.remove('searching', 'found', 'not-found');
            indicator.classList.add(state);
        }
    },

    showLoading(show) {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        const resultsContainer = document.getElementById('resultsContainer');
        
        if (show) {
            loadingState.classList.remove('hidden');
            emptyState.classList.add('hidden');
            resultsContainer.classList.add('hidden');
            
            // Resetear indicadores
            document.querySelectorAll('.source-indicator').forEach(ind => {
                ind.classList.remove('searching', 'found', 'not-found');
            });
        } else {
            loadingState.classList.add('hidden');
        }
    },

    clearResults() {
        document.getElementById('resultsContainer').innerHTML = '';
        document.getElementById('resultsContainer').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
    },

    // ==================== MOSTRAR RESULTADOS ====================
    
    displayResults(results) {
        const container = document.getElementById('resultsContainer');
        const emptyState = document.getElementById('emptyState');
        
        container.innerHTML = '';
        
        if (results.length === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        results.forEach(book => {
            const card = this.createResultCard(book);
            container.appendChild(card);
        });
    },

    createResultCard(book) {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const isFav = Storage.isFavorite(book.id);
        const coverHtml = book.coverUrl 
            ? `<img src="${book.coverUrl}" alt="${book.title}" loading="lazy" onerror="this.parentElement.innerHTML='<span style=font-size:2.5rem>📕</span>'">`
            : `<span style="font-size:2.5rem">📕</span>`;
        
        const authorsText = book.authors?.length > 0 
            ? book.authors.join(', ') 
            : 'Autor desconocido';
        
        const year = Utils.formatYear(book.publishedDate);
        
        card.innerHTML = `
            <div class="result-header">
                <div class="result-cover">
                    ${coverHtml}
                </div>
                <div class="result-info">
                    <h3 class="result-title">${book.title}</h3>
                    <p class="result-authors">${authorsText}</p>
                    <div class="result-meta">
                        ${book.publisher ? `<span class="meta-tag">🏢 ${book.publisher}</span>` : ''}
                        ${year ? `<span class="meta-tag">📅 ${year}</span>` : ''}
                        ${book.isbn ? `<span class="meta-tag">📠 ${Utils.formatISBN(book.isbn)}</span>` : ''}
                        ${book.pageCount ? `<span class="meta-tag">📄 ${book.pageCount} pág.</span>` : ''}
                        ${book.language ? `<span class="meta-tag">🌐 ${book.language.toUpperCase()}</span>` : ''}
                        <span class="result-source source-${book.source.toLowerCase().replace(/\s/g, '')}">
                            🗄️ ${book.source}
                        </span>
                    </div>
                    ${book.description ? `<p class="result-description">${Utils.truncate(book.description, 250)}</p>` : ''}
                    <div class="result-actions">
                        <button class="btn-action favorite ${isFav ? 'active' : ''}" data-id="${book.id}">
                            <i class="fas ${isFav ? 'fa-star' : 'fa-star'}"></i> ${isFav ? 'Favorito' : 'Favorito'}
                        </button>
                        <button class="btn-action details" data-id="${book.id}">
                            👁️ Ver detalles
                        </button>
                        ${book.infoLink ? `<a href="${book.infoLink}" target="_blank" class="btn-action">🔗 Ver fuente</a>` : ''}
                    </div>
                </div>
            </div>
            <div class="result-footer">
                <div class="export-buttons">
                    <button class="btn-export" data-format="bibtex" data-id="${book.id}">📋 BibTeX</button>
                    <button class="btn-export" data-format="ris" data-id="${book.id}">📄 RIS</button>
                    <button class="btn-export" data-format="csv" data-id="${book.id}">📊 CSV</button>
                    <button class="btn-export" data-format="json" data-id="${book.id}">📋 JSON</button>
                </div>
                <span class="result-date">${Utils.formatDate(book.timestamp)}</span>
            </div>
        `;
        
        // Event listeners
        card.querySelector('.favorite').addEventListener('click', (e) => {
            const isNowFav = Storage.toggleFavorite(book);
            const btn = e.currentTarget;
            btn.classList.toggle('active', isNowFav);
            btn.innerHTML = `⭐ ${isNowFav ? 'Favorito' : 'Favorito'}`;
            this.loadFavorites();
        });
        
        card.querySelector('.details').addEventListener('click', () => {
            this.showDetails(book);
        });
        
        card.querySelectorAll('.btn-export').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.dataset.format;
                this.exportBook(book, format);
            });
        });
        
        return card;
    },

    // ==================== DETALLES ====================
    
    setupModal() {
        const modal = document.getElementById('detailModal');
        const closeBtn = document.getElementById('modalClose');
        
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') modal.classList.remove('active');
        });
    },

    showDetails(book) {
        const modal = document.getElementById('detailModal');
        const body = document.getElementById('modalBody');
        
        const coverHtml = book.coverUrl 
            ? `<img src="${book.coverUrl}" alt="${book.title}">`
            : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.5);font-size:3rem;">📕</div>`;
        
        const authorsText = book.authors?.length > 0 
            ? book.authors.join(', ') 
            : 'Autor desconocido';
        
        body.innerHTML = `
            <div class="modal-body">
                <div class="modal-cover">${coverHtml}</div>
                <h2 class="modal-title">${book.title}</h2>
                <p class="modal-authors">${authorsText}</p>
                
                <div class="detail-grid">
                    ${book.publisher ? `
                        <div class="detail-item">
                            <div class="detail-label">Editorial</div>
                            <div class="detail-value">${book.publisher}</div>
                        </div>
                    ` : ''}
                    ${book.publishedDate ? `
                        <div class="detail-item">
                            <div class="detail-label">Año de publicación</div>
                            <div class="detail-value">${Utils.formatYear(book.publishedDate)}</div>
                        </div>
                    ` : ''}
                    ${book.isbn ? `
                        <div class="detail-item">
                            <div class="detail-label">ISBN</div>
                            <div class="detail-value">${Utils.formatISBN(book.isbn)}</div>
                        </div>
                    ` : ''}
                    ${book.isbn13 ? `
                        <div class="detail-item">
                            <div class="detail-label">ISBN-13</div>
                            <div class="detail-value">${Utils.formatISBN(book.isbn13)}</div>
                        </div>
                    ` : ''}
                    ${book.isbn10 ? `
                        <div class="detail-item">
                            <div class="detail-label">ISBN-10</div>
                            <div class="detail-value">${Utils.formatISBN(book.isbn10)}</div>
                        </div>
                    ` : ''}
                    ${book.pageCount ? `
                        <div class="detail-item">
                            <div class="detail-label">Páginas</div>
                            <div class="detail-value">${book.pageCount}</div>
                        </div>
                    ` : ''}
                    ${book.language ? `
                        <div class="detail-item">
                            <div class="detail-label">Idioma</div>
                            <div class="detail-value">${book.language.toUpperCase()}</div>
                        </div>
                    ` : ''}
                    ${book.doi ? `
                        <div class="detail-item">
                            <div class="detail-label">DOI</div>
                            <div class="detail-value">${book.doi}</div>
                        </div>
                    ` : ''}
                    <div class="detail-item">
                        <div class="detail-label">Fuente</div>
                        <div class="detail-value">${book.source}</div>
                    </div>
                </div>
                
                ${book.categories?.length > 0 ? `
                    <div class="detail-item" style="margin-bottom:1rem;">
                        <div class="detail-label">Categorías</div>
                        <div class="detail-value">${book.categories.join(', ')}</div>
                    </div>
                ` : ''}
                
                ${book.description ? `
                    <div class="modal-description">
                        <strong>Descripción:</strong><br>
                        ${book.description}
                    </div>
                ` : ''}
                
                <div class="modal-actions">
                    <button class="btn-export" onclick="App.exportBookById('${book.id}', 'bibtex')">📋 BibTeX</button>
                    <button class="btn-export" onclick="App.exportBookById('${book.id}', 'ris')">📄 RIS</button>
                    <button class="btn-export" onclick="App.exportBookById('${book.id}', 'csv')">📊 CSV</button>
                    <button class="btn-export" onclick="App.exportBookById('${book.id}', 'json')">📋 JSON</button>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
    },

    // ==================== EXPORTACIÓN ====================
    
    exportBook(book, format) {
        let content, filename, mimeType;
        
        switch (format) {
            case 'bibtex':
                content = Utils.exportBibTeX(book);
                filename = `${Utils.removeAccents(book.title).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.bib`;
                mimeType = 'application/x-bibtex';
                break;
            case 'ris':
                content = Utils.exportRIS(book);
                filename = `${Utils.removeAccents(book.title).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.ris`;
                mimeType = 'application/x-research-info-systems';
                break;
            case 'csv':
                content = Utils.exportCSV(book);
                filename = `${Utils.removeAccents(book.title).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.csv`;
                mimeType = 'text/csv';
                break;
            case 'json':
                content = Utils.exportJSON(book);
                filename = `${Utils.removeAccents(book.title).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.json`;
                mimeType = 'application/json';
                break;
        }
        
        Utils.downloadFile(content, filename, mimeType);
        Utils.showToast(`Exportado como ${format.toUpperCase()}`, 'success');
    },

    exportBookById(id, format) {
        const book = this.currentResults.find(b => b.id === id) || 
                     Storage.getFavorites().find(b => b.id === id);
        if (book) this.exportBook(book, format);
    },

    // ==================== HISTORIAL ====================
    
    setupHistory() {
        document.getElementById('clearHistory')?.addEventListener('click', () => {
            if (confirm('¿Eliminar todo el historial de búsquedas?')) {
                Storage.clearHistory();
                this.loadHistory();
                Utils.showToast('Historial eliminado', 'info');
            }
        });
    },

    loadHistory() {
        const history = Storage.getHistory();
        const list = document.getElementById('historyList');
        const empty = document.getElementById('historyEmpty');
        
        if (history.length === 0) {
            list.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        
        list.classList.remove('hidden');
        empty.classList.add('hidden');
        
        list.innerHTML = history.slice().reverse().map(item => {
            const typeIcons = {
                isbn: 'fa-barcode',
                titulo: 'fa-heading',
                autor: 'fa-user',
                doi: 'fa-fingerprint'
            };
            
            const date = new Date(item.timestamp);
            const timeStr = date.toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="history-item" data-id="${item.id}">
                    <div class="history-icon">
                        <i class="fas ${typeIcons[item.type] || 'fa-search'}"></i>
                    </div>
                    <div class="history-info">
                        <div class="history-query">${item.query}</div>
                        <div class="history-details">
                            <span>🔎 ${item.type.toUpperCase()}</span>
                            <span>📋 ${item.resultsCount} resultado(s)</span>
                            <span>🕐 ${timeStr}</span>
                        </div>
                    </div>
                    <div class="history-actions">
                        <button class="history-btn search-again" title="Buscar de nuevo">
                            🔍
                        </button>
                        <button class="history-btn delete" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Event listeners
        list.querySelectorAll('.history-item').forEach(item => {
            const id = item.dataset.id;
            const historyItem = history.find(h => h.id === id);
            
            item.querySelector('.search-again').addEventListener('click', () => {
                // Activar tab
                document.querySelector(`.tab-btn[data-tab="${historyItem.type}"]`)?.click();
                document.getElementById('searchInput').value = historyItem.query;
                
                // Ir a buscar
                document.querySelector('.nav-link[href="#buscar"]')?.click();
                this.performSearch();
            });
            
            item.querySelector('.delete').addEventListener('click', () => {
                Storage.removeHistory(id);
                this.loadHistory();
            });
        });
    },

    // ==================== FAVORITOS ====================
    
    setupFavorites() {
        document.getElementById('clearFavorites')?.addEventListener('click', () => {
            if (confirm('¿Eliminar todos los favoritos?')) {
                Storage.clearFavorites();
                this.loadFavorites();
                Utils.showToast('Favoritos eliminados', 'info');
            }
        });
    },

    loadFavorites() {
        const favorites = Storage.getFavorites();
        const list = document.getElementById('favoritesList');
        const empty = document.getElementById('favoritesEmpty');
        
        if (favorites.length === 0) {
            list.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        
        list.classList.remove('hidden');
        empty.classList.add('hidden');
        
        list.innerHTML = '';
        favorites.forEach(book => {
            const card = this.createResultCard(book);
            list.appendChild(card);
        });
    }
};

// ==================== INICIALIZAR ====================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
