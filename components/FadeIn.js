export default function FadeIn({
  as: Tag = "div",
  delay = 0,
  children,
  className = "",
}) {
  return (
    <Tag
      className={`fade-in-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
