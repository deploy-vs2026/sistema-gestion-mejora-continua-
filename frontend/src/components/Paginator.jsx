export const PAGE_SIZE = 50;

export function paginar(rows, page) {
  const start = page * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
}

export default function Paginator({ total, page, onPage }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const desde = page * PAGE_SIZE + 1;
  const hasta  = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="paginator">
      <span className="pag-info">
        {desde.toLocaleString()}–{hasta.toLocaleString()} de {total.toLocaleString()}
      </span>
      <div className="pag-controls">
        <button className="pag-btn" onClick={() => onPage(0)}        disabled={page === 0}>«</button>
        <button className="pag-btn" onClick={() => onPage(page - 1)} disabled={page === 0}>‹</button>
        <span className="pag-page">{page + 1} / {totalPages}</span>
        <button className="pag-btn" onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}>›</button>
        <button className="pag-btn" onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
      </div>
    </div>
  );
}
