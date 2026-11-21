export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>הדף לא נטען — ח. סבן</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#102A43" />
    <style>
      body {
        font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #F3F7FB;
        color: #102A43;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        margin: 0;
        padding: 1.5rem;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2rem 1.5rem;
        background: #fff;
        border: 1px solid #DCE6EF;
        border-radius: 1.25rem;
        box-shadow: 0 8px 28px rgba(16, 42, 67, 0.08);
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; font-weight: 800; }
      p { color: #5B6B7C; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.65rem 1.1rem;
        border-radius: 0.75rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        min-height: 2.75rem;
      }
      .primary { background: #102A43; color: #fff; }
      .secondary { background: #fff; color: #102A43; border-color: #DCE6EF; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>הדף לא נטען</h1>
      <p>אירעה תקלה זמנית בשרת. נסו לרענן, או חזרו למסך הבית.</p>
      <div class="actions">
        <button class="primary" type="button" onclick="location.reload()">נסו שוב</button>
        <a class="secondary" href="/">חזרה לבית</a>
      </div>
    </div>
  </body>
</html>`;
}
