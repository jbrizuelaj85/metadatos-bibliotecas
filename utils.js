/**
 * UTILIDADES - Metadatos para Bibliotecas
 * Funciones auxiliares: formato, validación, exportación
 */

const Utils = {
    /**
     * Valida un ISBN-10
     */
    isValidISBN10(isbn) {
        isbn = isbn.replace(/[-\s]/g, '');
        if (isbn.length !== 10) return false;
        if (!/^\d{9}[\dXx]$/.test(isbn)) return false;
        
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            const digit = isbn[i].toUpperCase() === 'X' ? 10 : parseInt(isbn[i]);
            sum += digit * (10 - i);
        }
        return sum % 11 === 0;
    },

    /**
     * Valida un ISBN-13
     */
    isValidISBN13(isbn) {
        isbn = isbn.replace(/[-\s]/g, '');
        if (isbn.length !== 13) return false;
        if (!/^\d{13}$/.test(isbn)) return false;
        
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            const digit = parseInt(isbn[i]);
            sum += digit * (i % 2 === 0 ? 1 : 3);
        }
        return sum % 10 === 0;
    },

    /**
     * Detecta si es ISBN, título, autor o DOI
     */
    detectQueryType(query) {
        const clean = query.trim();
        
        // DOI
        if (/^10\.\d{4,}\//.test(clean) || /^doi:/i.test(clean)) {
            return 'doi';
        }
        
        // ISBN-13
        if (/^\d{13}$/.test(clean.replace(/[-\s]/g, ''))) {
            return 'isbn';
        }
        
        // ISBN-10
        if (/^\d{9}[\dXx]$/.test(clean.replace(/[-\s]/g, ''))) {
            return 'isbn';
        }
        
        // Si tiene números y guiones, podría ser ISBN mal formateado
        if (/^[\d\-Xx\s]{10,17}$/.test(clean)) {
            return 'isbn';
        }
        
        return null; // Indeterminado, usar tipo activo
    },

    /**
     * Limpia y normaliza ISBN
     */
    cleanISBN(isbn) {
        return isbn.replace(/[-\s]/g, '').toUpperCase();
    },

    /**
     * Convierte ISBN-10 a ISBN-13
     */
    isbn10to13(isbn10) {
        isbn10 = this.cleanISBN(isbn10);
        if (isbn10.length !== 10) return null;
        
        let isbn13 = '978' + isbn10.substring(0, 9);
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(isbn13[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const check = (10 - (sum % 10)) % 10;
        return isbn13 + check;
    },

    /**
     * Formatea ISBN para visualización
     */
    formatISBN(isbn) {
        isbn = this.cleanISBN(isbn);
        if (isbn.length === 13) {
            return isbn.replace(/(\d{3})(\d{1})(\d{3})(\d{5})(\d{1})/, '$1-$2-$3-$4-$5');
        }
        if (isbn.length === 10) {
            return isbn.replace(/(\d{1})(\d{3})(\d{5})([\dX])/, '$1-$2-$3-$4');
        }
        return isbn;
    },

    /**
     * Trunca texto con ellipsis
     */
    truncate(text, maxLength = 200) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    },

    /**
     * Formatea fecha
     */
    formatDate(date) {
        if (!date) return 'N/A';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date;
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    /**
     * Formatea año
     */
    formatYear(dateStr) {
        if (!dateStr) return null;
        const match = dateStr.toString().match(/(\d{4})/);
        return match ? match[1] : dateStr;
    },

    /**
     * Genera ID único
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Escapa caracteres especiales para BibTeX
     */
    escapeBibTeX(str) {
        if (!str) return '';
        return str
            .replace(/\\/g, '\\textbackslash{}')
            .replace(/&/g, '\\&')
            .replace(/%/g, '\\%')
            .replace(/\$/g, '\\$')
            .replace(/#/g, '\\#')
            .replace(/_/g, '\\_')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/~/g, '\\textasciitilde{}')
            .replace(/\^/g, '\\textasciicircum{}');
    },

    /**
     * Genera clave BibTeX
     */
    generateBibKey(authors, year, title) {
        let key = '';
        if (authors && authors.length > 0) {
            const firstAuthor = authors[0];
            const lastName = firstAuthor.includes(',') 
                ? firstAuthor.split(',')[0].trim()
                : firstAuthor.split(' ').pop();
            key += this.removeAccents(lastName).toLowerCase();
        }
        if (year) key += year;
        if (title) {
            const firstWord = title.split(' ')[0];
            key += this.removeAccents(firstWord).toLowerCase();
        }
        return key || 'ref' + Math.floor(Math.random() * 10000);
    },

    /**
     * Remueve acentos
     */
    removeAccents(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    /**
     * Exporta a BibTeX
     */
    exportBibTeX(book) {
        const authors = book.authors || [];
        const year = this.formatYear(book.publishedDate) || 'n.d.';
        const key = this.generateBibKey(authors, year, book.title);
        
        let bib = `@book{${key},\n`;
        bib += `  title = {${this.escapeBibTeX(book.title)}},\n`;
        
        if (authors.length > 0) {
            if (authors.length === 1) {
                bib += `  author = {${this.escapeBibTeX(authors[0])}},\n`;
            } else if (authors.length === 2) {
                bib += `  author = {${this.escapeBibTeX(authors.join(' and '))}},\n`;
            } else {
                bib += `  author = {${this.escapeBibTeX(authors.slice(0, -1).join(' and '))} and ${this.escapeBibTeX(authors[authors.length - 1])}},\n`;
            }
        }
        
        if (book.publisher) bib += `  publisher = {${this.escapeBibTeX(book.publisher)}},\n`;
        if (year !== 'n.d.') bib += `  year = {${year}},\n`;
        if (book.isbn) bib += `  isbn = {${book.isbn}},\n`;
        if (book.pageCount) bib += `  pages = {${book.pageCount}},\n`;
        if (book.language) bib += `  language = {${book.language}},\n`;
        if (book.categories && book.categories.length > 0) {
            bib += `  keywords = {${this.escapeBibTeX(book.categories.join(', '))}},\n`;
        }
        
        bib += '}';
        return bib;
    },

    /**
     * Exporta a RIS
     */
    exportRIS(book) {
        let ris = 'TY  - BOOK\n';
        ris += `TI  - ${book.title}\n`;
        
        (book.authors || []).forEach(author => {
            ris += `AU  - ${author}\n`;
        });
        
        if (book.publisher) ris += `PB  - ${book.publisher}\n`;
        if (book.publishedDate) ris += `PY  - ${this.formatYear(book.publishedDate)}\n`;
        if (book.isbn) ris += `SN  - ${book.isbn}\n`;
        if (book.pageCount) ris += `SP  - ${book.pageCount}\n`;
        if (book.language) ris += `LA  - ${book.language}\n`;
        if (book.description) ris += `AB  - ${book.description}\n`;
        if (book.categories && book.categories.length > 0) {
            ris += `KW  - ${book.categories.join(', ')}\n`;
        }
        if (book.infoLink) ris += `UR  - ${book.infoLink}\n`;
        
        ris += 'ER  - ';
        return ris;
    },

    /**
     * Exporta a CSV
     */
    exportCSV(books) {
        if (!Array.isArray(books)) books = [books];
        
        const headers = ['Título', 'Autores', 'Editorial', 'Año', 'ISBN', 'Páginas', 'Idioma', 'Categorías', 'Descripción', 'Fuente'];
        let csv = '\uFEFF'; // BOM para Excel
        csv += headers.join(';') + '\n';
        
        books.forEach(book => {
            const row = [
                book.title || '',
                (book.authors || []).join(', '),
                book.publisher || '',
                this.formatYear(book.publishedDate) || '',
                book.isbn || '',
                book.pageCount || '',
                book.language || '',
                (book.categories || []).join(', '),
                book.description ? book.description.replace(/[\r\n]+/g, ' ') : '',
                book.source || ''
            ];
            csv += row.map(field => `"${field.replace(/"/g, '""')}"`).join(';') + '\n';
        });
        
        return csv;
    },

    /**
     * Exporta a JSON
     */
    exportJSON(book) {
        return JSON.stringify(book, null, 2);
    },

    /**
     * Descarga archivo
     */
    downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Muestra toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, duration);
    },

    /**
     * Debounce
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Extrae autores de diferentes formatos
     */
    parseAuthors(authorsData) {
        if (!authorsData) return [];
        if (Array.isArray(authorsData)) return authorsData.filter(a => a && a.trim());
        if (typeof authorsData === 'string') {
            return authorsData.split(/[,;]/).map(a => a.trim()).filter(a => a);
        }
        return [];
    },

    /**
     * Normaliza datos de libro desde diferentes fuentes
     */
    normalizeBook(data, source) {
        const normalized = {
            id: data.id || this.generateId(),
            title: data.title || 'Sin título',
            authors: this.parseAuthors(data.authors),
            publisher: data.publisher || null,
            publishedDate: data.publishedDate || data.year || null,
            isbn: data.isbn || data.ISBN || null,
            isbn13: data.isbn13 || null,
            isbn10: data.isbn10 || null,
            pageCount: data.pageCount || data.pages || null,
            language: data.language || null,
            categories: data.categories || data.subjects || [],
            description: data.description || data.abstract || null,
            coverUrl: data.coverUrl || data.thumbnail || data.imageLinks?.thumbnail || null,
            infoLink: data.infoLink || data.url || null,
            source: source || data.source || 'unknown',
            timestamp: Date.now()
        };

        // Normalizar ISBN
        if (normalized.isbn) {
            const clean = this.cleanISBN(normalized.isbn);
            if (clean.length === 13) {
                normalized.isbn13 = clean;
            } else if (clean.length === 10) {
                normalized.isbn10 = clean;
                normalized.isbn13 = this.isbn10to13(clean);
            }
            normalized.isbn = normalized.isbn13 || normalized.isbn10 || normalized.isbn;
        }

        return normalized;
    }
};
