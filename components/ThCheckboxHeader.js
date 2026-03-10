function ThCheckboxHeader({
  headerCbRef,
  pageAllSelected,
  pageSelectableCount,
  toggleSelectAllPage,
}) {
  return (
    <th className="w-12 bg-white border-r border-black/10" scope="col">
      <input
        ref={headerCbRef}
        type="checkbox"
        checked={pageAllSelected && pageSelectableCount > 0}
        onChange={toggleSelectAllPage}
        aria-label="Select all eligible rows on this page"
        disabled={pageSelectableCount === 0}
        title={
          pageSelectableCount === 0
            ? "No eligible rows on this page"
            : "Select all eligible rows on this page"
        }
      />
    </th>
  );
}

export default ThCheckboxHeader;
