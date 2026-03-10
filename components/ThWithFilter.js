import SortIcon from "./SortIcon";

function ThWithFilter({
  label,
  children,
  widthClass = "",
  nowrap = false,
  sortKey,
  sort,
  onSort,
}) {
  return (
    <th
      className={`${widthClass} ${nowrap ? "whitespace-nowrap" : ""} bg-white`}
      scope="col"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSort?.(sortKey)}
          className="flex items-center justify-between w-full text-left"
          title={`Sort by ${label}`}
        >
          <span className="font-medium">{label}</span>
          <span className="ml-2">
            <SortIcon active={sort.key === sortKey} dir={sort.dir} />
          </span>
        </button>

        {/* Filter control */}
        {children}
      </div>
    </th>
  );
}

export default ThWithFilter;
