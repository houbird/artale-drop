export function highlight(text, keyword) {
  if (!keyword) return text;

  if (keyword.includes('|')) {
    const keywords = keyword.split('|').map(k => k.trim());
    let highlightedText = text;
    keywords.forEach(k => {
      const regex = new RegExp(`(${k})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    return highlightedText;
  }

  const regex = new RegExp(`(${keyword})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export function isBoss(monster, bossTime) {
  return bossTime && Object.prototype.hasOwnProperty.call(bossTime, monster);
}

export function getDisplayName(item, aliasMap, bossTime) {
  let name = item;
  if (aliasMap[item] && aliasMap[item] !== item) {
    name = `${item}(${aliasMap[item]})`;
  }
  if (isBoss(item, bossTime)) {
    name += ' (BOSS)';
  }
  return name;
}

export function matchesKeyword(item, keyword, aliasMap, bossTime) {
  if (!keyword) return true;
  const loweredItem = item.toLowerCase();
  const alias = aliasMap[item];

  if (keyword.includes('|')) {
    const keywords = keyword.split('|').map(k => k.trim().toLowerCase());
    return keywords.some(k => {
      if (k === 'boss' && isBoss(item, bossTime)) return true;
      return loweredItem.includes(k) || (alias && alias.toLowerCase().includes(k));
    });
  }

  const loweredKeyword = keyword.toLowerCase();
  if (loweredKeyword === 'boss' && isBoss(item, bossTime)) return true;
  return loweredItem.includes(loweredKeyword) ||
         (alias && alias.toLowerCase().includes(loweredKeyword));
}

