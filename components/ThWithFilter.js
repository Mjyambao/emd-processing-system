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
        {/*
          This is a div (not a button) on purpose: the `label` prop can contain
          its own interactive button (the filter toggle), and a <button> cannot
          legally contain another <button>. role/tabIndex/onKeyDown keep it
          keyboard-accessible while allowing nested controls.
        */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSort?.(sortKey)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSort?.(sortKey);
            }
          }}
          className="flex items-center justify-between w-full text-left cursor-pointer select-none"
          title={`Sort by ${label}`}
        >
          <span className="font-medium">{label}</span>
          <span className="ml-2">
            <SortIcon active={sort.key === sortKey} dir={sort.dir} />
          </span>
        </div>

        {/* Filter control */}
        {children}
      </div>
    </th>
  );
}

export default ThWithFilter;