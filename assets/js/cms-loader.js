/**
 * Rebecca Bennett — CMS Content Loader
 * Dynamically fetches blog posts, gallery images, and projects from
 * the GitHub repository via the GitHub Contents API.
 * No manifest.json needed — new posts appear automatically.
 */

const GITHUB_REPO = 'BeccaForearth/beccaforearth';
const GITHUB_BRANCH = 'main';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

// ─── Markdown Front Matter Parser ─────────────────────────────────────────────
function parseFrontMatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: text };

    const data = {};
    const lines = match[1].split('\n');
    let currentKey = null;
    let multilineValue = '';

    lines.forEach(line => {
        // Handle YAML multiline values (indented continuation lines)
        if (currentKey && line.match(/^\s+\S/)) {
            multilineValue += ' ' + line.trim();
            data[currentKey] = multilineValue.trim();
            return;
        }

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return;

        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();

        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Boolean
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        // Number
        else if (!isNaN(value) && value !== '') value = Number(value);

        data[key] = value;
        currentKey = key;
        multilineValue = String(value);
    });

    return { data, content: match[2].trim() };
}

// ─── Fetch file list from GitHub API ─────────────────────────────────────────
async function fetchFileList(collection) {
    try {
        const res = await fetch(
            `${GITHUB_API}/${collection}?ref=${GITHUB_BRANCH}`,
            { headers: { 'Accept': 'application/vnd.github.v3+json' } }
        );
        if (!res.ok) return [];
        const files = await res.json();
        // Return only .md files, sorted by name descending (newest first by date prefix)
        return files
            .filter(f => f.name.endsWith('.md'))
            .sort((a, b) => b.name.localeCompare(a.name))
            .map(f => f.name);
    } catch {
        return [];
    }
}

// ─── Fetch and parse a single markdown file from GitHub ───────────────────────
async function fetchMarkdown(collection, filename) {
    try {
        // Use raw.githubusercontent.com for fast, uncached content delivery
        const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${collection}/${filename}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        return parseFrontMatter(text);
    } catch {
        return null;
    }
}

// ─── Load Blog Posts ──────────────────────────────────────────────────────────
async function loadBlogPosts(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#9ca3af;">
            <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em;">Loading posts...</div>
        </div>`;

    const files = await fetchFileList('content/blog');

    if (!files.length) {
        container.innerHTML = '';
        return;
    }

    const posts = [];
    for (const file of files) {
        const parsed = await fetchMarkdown('content/blog', file);
        if (parsed && parsed.data.published !== false) {
            posts.push({ ...parsed.data, body: parsed.content, file });
        }
    }

    // Sort by date descending
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!posts.length) {
        container.innerHTML = '';
        return;
    }

    // Store globally for modal access
    window._blogPosts = posts;

    container.innerHTML = posts.map(post => `
        <article class="blog-card" style="background:white; border:1px solid #e5e7eb; overflow:hidden; cursor:pointer; transition: box-shadow 0.2s;"
                 onmouseenter="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'"
                 onmouseleave="this.style.boxShadow='none'"
                 onclick="openBlogModal('${post.file}')">
            ${post.featured_image
                ? `<img src="${post.featured_image}" alt="${escHtml(post.title)}" style="width:100%; height:220px; object-fit:cover;">`
                : `<div style="width:100%; height:220px; background:#f3f4f6; display:flex; align-items:center; justify-content:center;"><span style="color:#9ca3af; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em;">No image</span></div>`
            }
            <div style="padding:1.5rem;">
                <span style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.1em; color:#b8964a; font-weight:600;">${escHtml(post.category || '')}</span>
                <h3 style="font-family:'Cardo',Georgia,serif; font-size:1.2rem; margin:0.5rem 0; color:#1a1a1a; line-height:1.4;">${escHtml(post.title || '')}</h3>
                <p style="font-size:0.85rem; color:#6b7280; line-height:1.6; margin:0 0 1rem;">${escHtml(post.excerpt || '')}</p>
                <span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:#374151; border-bottom:1px solid #b8964a; padding-bottom:2px;">Read More</span>
            </div>
        </article>
    `).join('');
}

// ─── Blog Post Modal ──────────────────────────────────────────────────────────
window.openBlogModal = async function(file) {
    const post = window._blogPosts?.find(p => p.file === file);
    if (!post) return;

    // Parse markdown body — use marked.js if available
    let bodyHtml;
    if (window.marked) {
        bodyHtml = window.marked.parse(post.body || '');
    } else {
        // Basic markdown-to-HTML fallback
        bodyHtml = (post.body || '')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^#{1,6}\s+(.+)$/gm, '<h3 style="font-family:\'Cardo\',serif;font-size:1.3rem;margin:1.5rem 0 0.5rem;color:#1a1a1a;">$1</h3>')
            .replace(/^\* (.+)$/gm, '<li style="margin-bottom:0.5rem;">$1</li>')
            .replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="margin:1rem 0 1rem 1.5rem;list-style:disc;">$1</ul>')
            .replace(/\n\n/g, '</p><p style="margin-bottom:1.2rem;line-height:1.9;color:#444;">')
            .replace(/\n/g, '<br>');
        bodyHtml = `<p style="margin-bottom:1.2rem;line-height:1.9;color:#444;">${bodyHtml}</p>`;
    }

    // Remove existing modal if any
    const existing = document.getElementById('blog-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'blog-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;box-sizing:border-box;';
    modal.innerHTML = `
        <div style="background:white;max-width:760px;width:100%;padding:3rem;position:relative;margin:auto;border-radius:2px;">
            <button onclick="document.getElementById('blog-modal').remove()"
                    style="position:absolute;top:1rem;right:1.5rem;background:none;border:none;font-size:1.8rem;cursor:pointer;color:#374151;line-height:1;">&times;</button>
            ${post.featured_image
                ? `<img src="${post.featured_image}" alt="${escHtml(post.title)}" style="width:100%;height:320px;object-fit:cover;margin-bottom:2rem;">`
                : ''}
            <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:#b8964a;font-weight:600;">${escHtml(post.category || '')}</span>
            <h2 style="font-family:'Cardo',Georgia,serif;font-size:2rem;margin:0.5rem 0 0.25rem;color:#1a1a1a;line-height:1.3;">${escHtml(post.title || '')}</h2>
            <p style="font-size:0.75rem;color:#9ca3af;margin:0 0 2rem;">${escHtml(String(post.date || ''))}</p>
            <div style="font-size:1rem;line-height:1.8;color:#374151;">${bodyHtml}</div>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    modal.addEventListener('remove', () => { document.body.style.overflow = ''; });
    modal.querySelector('button').addEventListener('click', () => { document.body.style.overflow = ''; });
};

// ─── Load Gallery Images ──────────────────────────────────────────────────────
async function loadGalleryImages(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const files = await fetchFileList('content/gallery');
    if (!files.length) return;

    const images = [];
    for (const file of files) {
        const parsed = await fetchMarkdown('content/gallery', file);
        if (parsed) images.push({ ...parsed.data, file });
    }

    images.sort((a, b) => (a.order || 99) - (b.order || 99));
    if (!images.length) return;

    const existingItems = container.querySelectorAll('.gallery-item');
    existingItems.forEach(el => el.remove());

    images.forEach(img => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-category', img.category || 'All');
        item.style.cssText = 'position:relative;overflow:hidden;cursor:pointer;aspect-ratio:1;';
        item.innerHTML = `
            <img src="${img.image}" alt="${escHtml(img.alt || img.title)}"
                 style="width:100%;height:100%;object-fit:cover;transition:transform 0.4s ease;"
                 loading="lazy">
            <div class="gallery-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;transition:background 0.3s;">
                <span style="color:white;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;opacity:0;transition:opacity 0.3s;">${escHtml(img.title || '')}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── HTML escape helper ───────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Auto-initialise on DOM ready ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#cms-blog-grid')) {
        // Load marked.js for proper markdown rendering, then load posts
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        script.onload = () => loadBlogPosts('#cms-blog-grid');
        script.onerror = () => loadBlogPosts('#cms-blog-grid'); // fallback without marked
        document.head.appendChild(script);
    }
    if (document.querySelector('#cms-gallery-grid')) {
        loadGalleryImages('#cms-gallery-grid');
    }
});
