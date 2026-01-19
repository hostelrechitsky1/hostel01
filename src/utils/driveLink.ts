export const normalizeDriveLink = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname !== 'drive.google.com') {
    return null;
  }

  const path = url.pathname;
  const folderMatch = path.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    return `https://drive.google.com/drive/folders/${folderMatch[1]}`;
  }

  const fileMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/file/d/${fileMatch[1]}/view`;
  }

  const openId = url.searchParams.get('id');
  if (openId) {
    return `https://drive.google.com/file/d/${openId}/view`;
  }

  return null;
};
