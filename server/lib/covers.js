// Finds cover artwork online for a book (Open Library, Google Books, then Wikipedia).

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PuritanLibrary/1.0 (cover lookup)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function searchCovers(title, author = '') {
  const results = [];
  const seen = new Set();
  const add = (url, source, label) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      results.push({ url, source, label });
    }
  };

  try {
    const params = new URLSearchParams({ title, limit: '12', fields: 'title,author_name,cover_i,first_publish_year' });
    if (author) params.set('author', author);
    const data = await getJson(`https://openlibrary.org/search.json?${params}`);
    for (const d of data.docs || []) {
      if (d.cover_i) {
        add(
          `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
          'Open Library',
          [d.title, d.author_name?.[0], d.first_publish_year].filter(Boolean).join(' · '),
        );
      }
    }
  } catch (err) {
    console.warn('Open Library cover search failed:', err.message);
  }

  try {
    const q = `intitle:${title}${author ? ` inauthor:${author}` : ''}`;
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12`);
    for (const item of data.items || []) {
      const links = item.volumeInfo?.imageLinks;
      const url = links?.thumbnail || links?.smallThumbnail;
      if (url) {
        add(
          url.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=2'),
          'Google Books',
          [item.volumeInfo.title, item.volumeInfo.authors?.[0], item.volumeInfo.publishedDate].filter(Boolean).join(' · '),
        );
      }
    }
  } catch (err) {
    console.warn('Google Books cover search failed:', err.message);
  }

  try {
    // Wikipedia often has title-page images for older works that have no modern edition cover.
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `${title} ${author}`.trim(),
      gsrlimit: '6',
      prop: 'pageimages',
      piprop: 'original',
      origin: '*',
    });
    const data = await getJson(`https://en.wikipedia.org/w/api.php?${params}`);
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
    for (const page of pages) {
      if (page.original?.source && !/\.svg$/i.test(page.original.source)) {
        add(page.original.source, 'Wikipedia', page.title);
      }
    }
  } catch (err) {
    console.warn('Wikipedia cover search failed:', err.message);
  }

  return results;
}

export async function findCover(title, author) {
  const results = await searchCovers(title, author);
  return results[0]?.url || '';
}
