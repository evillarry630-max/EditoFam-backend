// Open Graph meta tags generator for Discord embeds
function generateOGTags(video, baseUrl) {
  const videoUrl = `${baseUrl}/video/${video.id}`;
  const title = video.title || 'EditoFam Video';
  const description = video.caption || 'Watch this video on EditoFam';
  const thumbnailUrl = `${baseUrl}/api/videos/${video.id}/thumbnail`;

  return `
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${thumbnailUrl}" />
    <meta property="og:url" content="${videoUrl}" />
    <meta property="og:type" content="video.other" />
    <meta property="og:video" content="${videoUrl}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="twitter:card" content="player" />
    <meta property="twitter:title" content="${escapeHtml(title)}" />
    <meta property="twitter:description" content="${escapeHtml(description)}" />
    <meta property="twitter:image" content="${thumbnailUrl}" />
  `;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = { generateOGTags, escapeHtml };
