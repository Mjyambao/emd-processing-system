function Chip({ label, onClick, active, color = "slate" }) {
  const colorMap = {
    slate: "border-slate-300 text-slate-700 hover:bg-slate-50",
    green: "border-green-300 text-green-700 hover:bg-green-50",
    yellow: "border-yellow-300 text-yellow-700 hover:bg-yellow-50",
    red: "border-red-300 text-red-700 hover:bg-red-50",
    gray: "border-gray-300 text-gray-700 hover:bg-gray-100",
    blue: "border-blue-400 text-blue-800 hover:bg-blue-50",
  };
  const activeMap = {
    slate: "bg-slate-200",
    green: "bg-green-200",
    yellow: "bg-yellow-200",
    red: "bg-red-200",
    gray: "bg-gray-200",
    blue: "bg-blue-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "badge border transition-colors",
        colorMap[color] || colorMap.slate,
        active ? activeMap[color] || activeMap.slate : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default Chip;
