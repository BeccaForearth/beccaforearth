/**
 * Rebecca Bennett — CMS Content Loader
 * Reads Decap CMS markdown files from /content/ and renders them dynamically.
 * Uses the marked.js library for markdown parsing.
 */

// ─── Markdown Front Matter Parser ─────────────────────────────────────────────
function parseFrontMatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: text };

    const data = {};
    const lines = match[1].split('\n');
    lines.forEach(line => {
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
    });

    return { data, content: match[2].trim() };
}

// ─── Fetch a list of content files from a manifest ────────────────────────────
async function fetchContentList(collection) {
    try {
        const res = await fetch(`/content/${collection}/manifest.json`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

// ─── Fetch and parse a single markdown file ───────────────────────────────────
async function fetchMarkdown(path) {
    try {
        const res = await fetch(path);
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

    const files = await fetchContentList('blog');
    if (!files.length) return; // Fall back to static HTML

    const posts = [];
    for (const file of files) {
        const parsed = await fetchMarkdown(`/content/blog/${file}`);
        if (parsed && parsed.data.published !== false) {
            posts.push({ ...parsed.data, body: parsed.content, file });
        }
    }

    // Sort by date descending
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!posts.length) return;

    container.innerHTML = posts.map(post => `
        <article class="blog-card" style="background:white; border:1px solid #e5e7eb; overflow:hidden; cursor:pointer;"
                 onclick="openBlogModal('${post.file}')">
            ${post.featured_image ? `<img src="${post.featured_image}" alt="${post.title}" style="width:100%; height:220px; object-fit:cover;">` : ''}
            <div style="padding:1.5rem;">
                <span style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.1em; color:#b8964a; font-weight:600;">${post.category || ''}</span>
                <h3 style="font-family:'Playfair Display',Georgia,serif; font-size:1.2rem; margin:0.5rem 0; color:#1a1a1a; line-height:1.4;">${post.title}</h3>
                <p style="font-size:0.85rem; color:#6b7280; line-height:1.6; margin:0 0 1rem;">${post.excerpt || ''}</p>
                <span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:#374151; border-bottom:1px solid #b8964a; padding-bottom:2px; cursor:pointer;">Read More</span>
            </div>
        </article>
    `).join('');

    // Store posts globally for modal access
    window._blogPosts = posts;
}

// ─── Blog Post Modal ──────────────────────────────────────────────────────────
window.openBlogModal = async function(file) {
    const post = window._blogPosts?.find(p => p.file === file);
    if (!post) return;

    // Use marked if available, otherwise plain text
    const bodyHtml = window.marked ? window.marked.parse(post.body) : post.body.replace(/\n/g, '<br>');

    const modal = document.createElement('div');
    modal.id = 'blog-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;box-sizing:border-box;';
    modal.innerHTML = `
        <div style="background:white;max-width:760px;width:100%;padding:3rem;position:relative;margin:auto;">
            <button onclick="document.getElementById('blog-modal').remove()" 
                    style="position:absolute;top:1rem;right:1.5rem;background:none;border:none;font-size:1.8rem;cursor:pointer;color:#374151;line-height:1;">&times;</button>
            ${post.featured_image ? `<img src="${post.featured_image}" alt="${post.title}" style="width:100%;height:320px;object-fit:cover;margin-bottom:2rem;">` : ''}
            <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:#b8964a;font-weight:600;">${post.category || ''}</span>
            <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:2rem;margin:0.5rem 0 0.25rem;color:#1a1a1a;line-height:1.3;">${post.title}</h2>
            <p style="font-size:0.75rem;color:#9ca3af;margin:0 0 2rem;">${post.date || ''}</p>
            <div style="font-size:1rem;line-height:1.8;color:#374151;">${bodyHtml}</div>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
};

// ─── Load Gallery Images ──────────────────────────────────────────────────────
async function loadGalleryImages(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const files = await fetchContentList('gallery');
    if (!files.length) return; // Fall back to static HTML

    const images = [];
    for (const file of files) {
        const parsed = await fetchMarkdown(`/content/gallery/${file}`);
        if (parsed) images.push({ ...parsed.data, file });
    }

    // Sort by order field
    images.sort((a, b) => (a.order || 99) - (b.order || 99));

    if (!images.length) return;

    // Inject images into existing gallery grid
    const existingItems = container.querySelectorAll('.gallery-item');
    existingItems.forEach(el => el.remove());

    images.forEach(img => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-category', img.category || 'All');
        item.style.cssText = 'position:relative;overflow:hidden;cursor:pointer;aspect-ratio:1;';
        item.innerHTML = `
            <img src="${img.image}" alt="${img.alt || img.title}" 
                 style="width:100%;height:100%;object-fit:cover;transition:transform 0.4s ease;"
                 loading="lazy">
            <div class="gallery-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;transition:background 0.3s;">
                <span style="color:white;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;opacity:0;transition:opacity 0.3s;">${img.title}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── Auto-initialise on DOM ready ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Blog page
    if (document.querySelector('#cms-blog-grid')) {
        loadBlogPosts('#cms-blog-grid');
    }
    // Portfolio/Gallery page
    if (document.querySelector('#cms-gallery-grid')) {
        loadGalleryImages('#cms-gallery-grid');
    }
});
