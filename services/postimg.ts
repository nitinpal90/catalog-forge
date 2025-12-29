
const PROXY = 'https://api.allorigins.win/get?url=';

export async function expandPostimgGallery(url: string): Promise<string[]> {
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();
    const regex = /href="(https:\/\/postimg\.cc\/[a-zA-Z0-9]+)"/g;
    const links = new Set<string>();
    let m;
    while ((m = regex.exec(json.contents)) !== null) {
      if (m[1] !== url) links.add(m[1]);
    }
    return Array.from(links);
  } catch (e) {
    return [];
  }
}

export async function resolvePostimgDirect(url: string): Promise<string> {
  // If it's already direct i.postimg link
  if (url.includes('i.postimg.cc')) return url;
  
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();
    const match = json.contents.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    return match ? match[1] : url;
  } catch (e) {
    return url;
  }
}

export async function resolvePostimgGallery(url: string): Promise<string[]> {
  return expandPostimgGallery(url);
}

export async function downloadPostimgHighRes(url: string): Promise<Blob | null> {
  const direct = await resolvePostimgDirect(url);
  try {
    const res = await fetch(direct);
    if (res.ok) return await res.blob();
  } catch (e) {}
  return null;
}
