function SortIcon({ active, dir }) {
  if (!active) return <i className="fa-solid fa-sort text-black/40" />;
  return dir === "asc" ? (
    <i className="fa-solid fa-sort-up text-brand-red" />
  ) : (
    <i className="fa-solid fa-sort-down text-brand-red" />
  );
}

export default SortIcon;
