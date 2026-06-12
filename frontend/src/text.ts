function defaultPlural(singular: string) {
  if (singular.endsWith("ch") || singular.endsWith("sh") || singular.endsWith("x") || singular.endsWith("s")) {
    return `${singular}es`;
  }
  if (singular.endsWith("y") && !/[aeiou]y$/i.test(singular)) {
    return `${singular.slice(0, -1)}ies`;
  }
  return `${singular}s`;
}

export function pluralize(count: number, singular: string, plural = defaultPlural(singular)) {
  return count === 1 ? singular : plural;
}

export function countLabel(count: number, singular: string, plural = defaultPlural(singular)) {
  return `${count} ${pluralize(count, singular, plural)}`;
}
