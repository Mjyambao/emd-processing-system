export default function Spinner({ className = "", size = "sm", color = "" }) {
  const sizeMap = {
    xs: "text-[10px]",
    sm: "text-[12px]",
    md: "text-base",
    lg: "text-xl",
  };
  return (
    <i
      className={[
        "fa-solid fa-spinner fa-spin",
        sizeMap[size] || sizeMap.sm,
        color,
        className,
      ].join(" ")}
    />
  );
}
