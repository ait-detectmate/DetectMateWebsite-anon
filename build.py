"""Build the DetectMate website into _site/.

Standard library only, so the Pages workflow needs nothing but Python.

    python build.py            # writes _site/
    python -m http.server -d _site 8000   # preview at http://localhost:8000
"""

from __future__ import annotations

import html
import json
import math
import shutil
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DATA = ROOT / "data"
STATIC = ROOT / "static"
OUT = ROOT / "_site"

PAGES = {
    "index.html": {
        "title": "DetectMate — log anomaly detection, built from parts",
        "description": "DetectMate Library: six parsers, thirteen detectors and four alert aggregators for streaming log anomaly detection.",
        "nav": "home",
    },
    "benchmarks.html": {
        "title": "Benchmarks — DetectMate",
        "description": "Detection quality of each DetectMate detector on labelled log datasets.",
        "nav": "benchmarks",
    },
}

METRICS = [
    ("precision", "Precision"),
    ("recall", "Recall"),
    ("f1", "F1"),
    ("events_per_sec", "Events/sec"),
]


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


# --------------------------------------------------------------- benchmarks


def fmt(metric: str, value: float | None) -> str:
    if value is None:
        return "—"
    if metric == "events_per_sec":
        return f"{value:,.0f}"
    return f"{value:.2f}"


VIEWS = [
    ("log-type", "log type"),
    ("dataset", "dataset"),
]

KINDS = [
    ("plot", "Plot"),
    ("table", "Table"),
]

# Plot rows: each row's SVG is as wide as its cell and PLOT_H px high, centred on y PLOT_MID.
# x positions are percentages of the plot width, so the rows and the header's axis line up
# at any width; the gridlines are drawn by site.css on the cell, at every --tick.
PLOT_H = 40
PLOT_MID = 20
def slug(key: str) -> str:
    return key.replace("_", "-")


def check_ids(bench: dict, detectors: list[dict]) -> None:
    """Stop the build on any id that doesn't resolve (nothing is dropped silently)."""
    det_ids = {d["id"] for d in detectors}
    ds_ids = {d["id"] for d in bench.get("datasets", [])}
    lt_ids = {t["id"] for t in bench.get("log_types", [])}
    bad: list[str] = []

    def need(kind: str, value: object, known: set, where: str) -> None:
        if value not in known:
            bad.append(f"unknown {kind} {value!r} in {where}")

    for ds in bench.get("datasets", []):
        need("log type", ds.get("log_type"), lt_ids, f"dataset {ds['id']}")
    for key in ("not_evaluated", "baselines"):
        for d in bench.get(key, []):
            need("detector", d, det_ids, key)
    for r in bench.get("results", []):
        need("detector", r["detector"], det_ids, "results")
        need("dataset", r["dataset"], ds_ids, "results")
    for r in bench.get("log_type_results", []):
        need("detector", r["detector"], det_ids, "log_type_results")
        need("log type", r["log_type"], lt_ids, "log_type_results")
    if bad:
        raise SystemExit("benchmarks.json does not match the site data:\n  " + "\n  ".join(bad))


def share(pct: float | list[float]) -> str:
    if isinstance(pct, list):
        lo, hi = pct
        return f"{lo:.1f} %" if lo == hi else f"{lo:.1f}–{hi:.1f} %"
    return f"{pct:.1f} %"


def render_cell(metric: str, result: dict | None) -> str:
    """One data cell: the number in dark text, or a muted word where there is no number."""
    if result is None:
        return '<td class="cell"><span class="cell__val">—</span></td>'
    value = result.get(metric)
    if metric == "precision" and result.get("no_alerts"):
        return '<td class="cell"><span class="cell__val cell__val--none">no alerts</span></td>'
    if value is None:
        return '<td class="cell"><span class="cell__val">—</span></td>'
    return f'<td class="cell"><span class="cell__val">{esc(fmt(metric, value))}</span></td>'


def render_bench_head(bench: dict, view: str, lead: list[str]) -> str:
    lead_ths = "".join(f'<th scope="col" class="lead">{esc(t)}</th>' for t in lead)
    if view == "log-type":
        cols = "".join(
            f'<th scope="col"><span class="h__name">{esc(t["name"])}</span>'
            f'<span class="h__sub">{esc(share(t["anomaly_pct"]))} anomalies</span></th>'
            for t in bench["log_types"]
        )
        return f"<thead><tr>{lead_ths}{cols}</tr></thead>"

    lt_names = {t["id"]: t["name"] for t in bench["log_types"]}
    groups: list[list] = []  # consecutive runs of one log type: [id, count]
    for ds in bench["datasets"]:
        if groups and groups[-1][0] == ds["log_type"]:
            groups[-1][1] += 1
        else:
            groups.append([ds["log_type"], 1])
    row1 = "".join(
        f'<th scope="colgroup" colspan="{n}" class="h__group">{esc(lt_names[lt])}</th>' for lt, n in groups
    )
    lead_ths = "".join(f'<th scope="col" rowspan="2" class="lead">{esc(t)}</th>' for t in lead)
    cols = []
    for ds in bench["datasets"]:
        name = esc(ds["name"])
        if ds.get("url"):
            name = f'<a href="{esc(ds["url"])}">{name}</a>'
        cols.append(
            f'<th scope="col"><span class="h__name">{name}</span>'
            f'<span class="h__sub">{esc(share(ds["anomaly_pct"]))}</span></th>'
        )
    return f"<thead><tr>{lead_ths}{row1}</tr><tr>{''.join(cols)}</tr></thead>"


def boxplot_stats(values: list[float]) -> dict:
    """The numbers one plot row draws: the lowest and highest value, the middle value, and
    the quartiles q1 and q3 (None below 3 values, where there is no box).

    The quartiles use linear interpolation, as matplotlib does.
    """
    mid = statistics.median(values)
    if len(values) < 3:
        return {"q1": None, "mid": mid, "q3": None, "lo": min(values), "hi": max(values)}
    q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return {"q1": q1, "mid": mid, "q3": q3, "lo": min(values), "hi": max(values)}


def order_rows(rows: list[dict], values: dict[str, list[float]]) -> list[tuple[dict, int | None]]:
    """One group's rows in display order, each with its rank (None where it has no number).

    values maps a row id to the values the block's plot draws for it. Rows with values
    come first, ranked 1..k by their middle value, highest first; a tie goes to the higher
    mean, then to the incoming order. Rows without values follow in incoming order, then
    the rows that are not evaluated.
    """
    def key(item: tuple[int, dict]) -> tuple:
        v = values[item[1]["id"]]
        return (-statistics.median(v), -statistics.fmean(v), item[0])

    items = list(enumerate(rows))
    ranked = sorted((i for i in items if not i[1]["skip"] and values.get(i[1]["id"])), key=key)
    empty = [i for i in items if not i[1]["skip"] and not values.get(i[1]["id"])]
    skipped = [i for i in items if i[1]["skip"]]
    return ([(row, n) for n, (_, row) in enumerate(ranked, 1)]
            + [(row, None) for _, row in empty + skipped])


def decade(exp: int) -> str:
    """Tick label for 10**exp: 10, 100, 1k, 10k, 1M ..."""
    for power, suffix in ((6, "M"), (3, "k")):
        if exp >= power:
            return f"{10 ** (exp - power)}{suffix}"
    return f"{10.0 ** exp:g}"


def plot_scale(metric: str, values: list[float]) -> tuple:
    """A block's x scale: value -> share of the plot width, the axis ticks as (share, label),
    and the share between two ticks.

    P, R and F1 use a fixed 0-1 axis. Events/s uses a log axis over the decades
    from the block's smallest to its largest value.
    """
    if metric != "events_per_sec":
        return (lambda v: v), [(t, f"{t:g}") for t in (0, 0.25, 0.5, 0.75, 1)], 0.25
    lo = math.floor(math.log10(min(values, default=1)))
    hi = max(math.ceil(math.log10(max(values, default=10))), lo + 1)

    def x(v: float) -> float:
        return (math.log10(v) - lo) / (hi - lo)

    return x, [((e - lo) / (hi - lo), decade(e)) for e in range(lo, hi + 1)], 1 / (hi - lo)


def pct(share: float) -> float:
    """A share of the plot width as a percentage with one decimal (37.4)."""
    return round(share * 100, 1)


def render_plot_head(lead: list[str], label: str, ticks: list[tuple]) -> str:
    """The plot's header row: the lead columns, then the tick labels at the rows' x positions."""
    lead_ths = "".join(f'<th scope="col" class="lead">{esc(t)}</th>' for t in lead)
    labels = "".join(f'<span style="left:{pct(at)}%">{esc(t)}</span>' for at, t in ticks)
    return (
        f'<thead><tr>{lead_ths}<th scope="col" class="plot">'
        f'<span class="visually-hidden">{esc(label)}</span><div class="axis" aria-hidden="true">{labels}</div>'
        "</th></tr></thead>"
    )


def render_plot(values: list[float], x) -> str:
    """One row's SVG: whiskers from the lowest to the highest value, a box from q1 to q3 at
    3 or more values, and a line at the middle value. No dots.

    x positions are percentages of the plot width, so the SVG needs no fixed width.
    """
    c = PLOT_MID
    st = boxplot_stats(values)
    lo, mid, hi = (pct(x(st[k])) for k in ("lo", "mid", "hi"))
    parts = []
    if st["q1"] is None:
        if hi > lo:
            parts.append(f'<line class="wh" x1="{lo}%" x2="{hi}%" y1="{c}" y2="{c}"/>')
    else:
        q1, q3 = pct(x(st["q1"])), pct(x(st["q3"]))
        for end, edge in ((lo, q1), (hi, q3)):  # a whisker and its cap, where the whisker has length
            a, b = sorted((end, edge))
            if b > a:
                parts.append(f'<line class="wh" x1="{a}%" x2="{b}%" y1="{c}" y2="{c}"/>')
                parts.append(f'<line class="wh" x1="{end}%" x2="{end}%" y1="{c - 6}" y2="{c + 6}"/>')
        parts.append(f'<rect class="box" x="{q1}%" width="{round(q3 - q1, 1)}%" y="{c - 10}" height="20"/>')
    parts.append(f'<line class="mid" x1="{mid}%" x2="{mid}%" y1="{c - 10}" y2="{c + 10}"/>')
    return f'<svg width="100%" height="{PLOT_H}">{"".join(parts)}</svg>'


def render_tip(metric: str, values: list[float], unit: str, without: int) -> str:
    """One plot row's numbers, the ones its SVG draws, as visually hidden text after it: a
    screen reader reads them, and site.js shows them in the tooltip.

    unit is the view's label (log type, dataset); without counts the results without alerts,
    which the plot leaves out.
    """
    st = boxplot_stats(values)

    def line(label: str, *nums: float) -> str:
        return f'{label} <span class="plot__n">{"–".join(fmt(metric, v) for v in nums)}</span>'

    if len(values) == 1:
        lines = [line("Value", st["mid"])]
    else:
        lines = [line("Middle value", st["mid"])]
        if st["q1"] is not None:
            lines.append(line("Middle half", st["q1"], st["q3"]))
        lines.append(line("Lowest–highest", st["lo"], st["hi"]))
    count = f'{len(values)} {esc(unit)}{"" if len(values) == 1 else "s"}'
    if without:
        count += f", {without} without alerts"
    return '<span class="plot__nums visually-hidden">' + "<br>".join(lines + [count]) + "</span>"


def frame_rows(bench: dict, detectors: list[dict], families: dict) -> tuple[list[dict], dict]:
    """The detector rows in incoming order, each with its lead cells per block kind ("head": a
    function of the row's rank in the block, or None, that returns the cells), and the lead
    column headings per block kind.

    A detector's plot row has one lead cell, the rank, the name and the family tag
    together, so the label wraps inside the plot's lead column; its table row keeps the
    family in a column of its own.
    """
    rows = []
    for d in detectors:
        link = f'<a href="{esc(d["docs"])}">{esc(d["name"])}</a>'
        tag = f'<span class="tag">{esc(families[d["family"]]["label"])}</span>'

        def name(rank: int | None, link: str = link) -> str:
            return f'<span class="row__num">{"" if rank is None else rank}</span>{link}'

        rows.append({
            "id": d["id"],
            "attrs": f' data-row="{esc(d["id"])}"',
            "head": {
                "table": lambda rank, name=name, tag=tag: f'<th scope="row">{name(rank)}</th><td>{tag}</td>',
                "plot": lambda rank, name=name, tag=tag: f'<th scope="row">{name(rank)}{tag}</th>',
            },
            "skip": d["id"] in bench.get("not_evaluated", []),
            "baseline": d["id"] in bench.get("baselines", []),
        })
    return rows, {"table": ["Detector", "Reads"], "plot": ["Detector"]}


def frame_lookups(bench: dict) -> dict:
    """{view: {(detector id, log type or dataset id): result}}."""
    return {
        "log-type": {(r["detector"], r["log_type"]): r for r in bench.get("log_type_results", [])},
        "dataset": {(r["detector"], r["dataset"]): r for r in bench.get("results", [])},
    }


def render_block(bench: dict, rows: list[dict], lead: list[str], lookup: dict,
                 kind: str, view: str, metric: str) -> str:
    """One block: a title row (the h3), then a table or a plot in its own fixed-height
    scroll box. The rows are ranked by their middle value for the block's metric and view.

    A row's "head" is its lead cells by block kind: {"table": f, "plot": f}, each a function
    of the row's rank (None for no number).
    """
    units = bench.get("log_types", []) if view == "log-type" else bench.get("datasets", [])
    label, view_label = dict(METRICS)[metric], dict(VIEWS)[view]

    def results(row: dict) -> list[tuple]:
        return [(u, lookup.get((row["id"], u["id"]))) for u in units]

    # the values a plot draws for each row; precision leaves out the values without alerts
    values = {
        row["id"]: [r[metric] for _, r in results(row) if r and r.get(metric) is not None]
        for row in rows if not row["skip"]
    }
    if kind == "table":
        thead = render_bench_head(bench, view, lead)
        ncols = len(units)

        def body(row: dict) -> str:
            return "".join(render_cell(metric, r) for _, r in results(row))
    else:
        x, ticks, tick = plot_scale(metric, [v for vs in values.values() for v in vs])
        thead = render_plot_head(lead, f"{label} per {view_label}", ticks)
        ncols = 1

        def body(row: dict) -> str:
            if values[row["id"]]:
                without = 0
                if metric == "precision":   # the results the plot leaves out
                    without = sum(1 for _, r in results(row) if r and r.get("no_alerts"))
                tip = render_tip(metric, values[row["id"]], view_label, without)
                return f'<td class="plot">{render_plot(values[row["id"]], x)}{tip}</td>'
            no_alerts = metric == "precision" and any(r and r.get("no_alerts") for _, r in results(row))
            word = "no alerts" if no_alerts else "—"
            return f'<td class="plot"><span class="cell__val--none">{esc(word)}</span></td>'

    def tr(row: dict, rank: int | None) -> str:
        head = row["head"][kind](rank)
        if row["skip"]:
            # in a plot the words sit on a patch of paper, so the gridlines stop behind them
            words = '<span class="cell__val--none">not evaluated</span>' if kind == "plot" else "not evaluated"
            skip = f'<td class="bench__skip" colspan="{ncols}">{words}</td>'
            return f'<tr{row["attrs"]}>{head}{skip}</tr>'
        return f'<tr{row["attrs"]}>{head}{body(row)}</tr>'

    main = order_rows([r for r in rows if not r["baseline"]], values)
    tbodies = "<tbody>" + "".join(tr(r, n) for r, n in main) + "</tbody>"
    base = order_rows([r for r in rows if r["baseline"]], values)
    if base:
        divider = (
            f'<tr><th scope="rowgroup" class="bench__divider" colspan="{len(lead) + ncols}">'
            "<span>Baselines</span></th></tr>"
        )
        tbodies += f'<tbody>{divider}{"".join(tr(r, None) for r, _ in base)}</tbody>'
    title = f"{label} per {view_label}"
    if kind == "table":
        table_open = '<table class="bench">'
    else:
        # the gridlines' spacing; site.css draws them on every plot cell
        table_open = f'<table class="bench bench--plot" style="--tick:{tick * 100:.6g}%">'
    return (
        f'<div class="bench-block" data-block-kind="{esc(kind)}" data-block-view="{esc(view)}" '
        f'data-block-metric="{esc(slug(metric))}"><div class="block__title"><h3>{esc(title)}</h3></div>'
        f'<div class="frame__scroll">{table_open}'
        f'<caption class="visually-hidden">{esc(title)}, as a {esc(kind)}</caption>'
        f"{thead}{tbodies}</table></div></div>"
    )


def render_frame(bench: dict, detectors: list[dict], families: dict) -> str:
    """The detectors' frame: switch bar, then blocks.

    Without JavaScript the bar stays hidden and every block shows, each under its h3 in its
    own fixed-height scroll box.
    """
    if not bench.get("results"):
        return ""
    rows, leads = frame_rows(bench, detectors, families)
    lookups = frame_lookups(bench)
    blocks = [
        render_block(bench, rows, leads[kind], lookups[view], kind, view, metric)
        for kind, _ in KINDS for view, _ in VIEWS for metric, _ in METRICS
    ]
    return (
        f'<div class="frame" data-frame="detectors">{render_frame_bar(METRICS)}\n'
        + "\n".join(blocks)
        + "</div>"
    )


def render_benchmark_banner(bench: dict) -> str:
    if bench.get("results"):
        env = bench.get("environment", {})
        bits = []
        if bench.get("generated_at"):
            bits.append(f"generated {esc(bench['generated_at'])}")
        if env.get("hardware"):
            bits.append(esc(env["hardware"]))
        if bench.get("library_version"):
            bits.append(f"Library {esc(bench['library_version'])}")
        return f'<p class="bench-meta">{" · ".join(bits)}</p>'
    return (
        '<div class="notice" role="note">'
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linecap="round" aria-hidden="true">'
        '<path d="M12 8v5M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'
        "</svg>"
        "<p><strong>No results published yet.</strong> The evaluation suite is still being built, "
        "so every cell below is empty. This page fills in automatically once results are added to "
        "<code>data/benchmarks.json</code>.</p>"
        "</div>"
    )


def render_switch(name: str, label: str, options: list[tuple[str, str]], default: str) -> str:
    """A group of chips under a visible label that matches its aria-label."""
    buttons = "".join(
        f'<button type="button" class="chip" data-{name}="{esc(key)}" '
        f'aria-pressed="{"true" if key == default else "false"}">{esc(text)}</button>'
        for key, text in options
    )
    return (
        f'<div class="chips" role="group" aria-label="{esc(label)}" data-switch="{name}">'
        f'<span class="chips__label">{esc(label)}</span>{buttons}</div>'
    )


def render_frame_bar(metrics: list[tuple[str, str]]) -> str:
    """A frame's switch bar: table or plot, view, metric. Hidden until site.js runs."""
    return (
        '<div class="frame__bar" hidden>'
        + render_switch("kind", "Show", KINDS, "plot")
        + render_switch("view", "Values per", [(key, text.capitalize()) for key, text in VIEWS], "log-type")
        + render_switch("metric", "Metric", [(slug(key), text) for key, text in metrics], "precision")
        + "</div>"
    )


# -------------------------------------------------------------------- build


def build() -> None:
    det = load("detectors.json")
    detectors, families = det["detectors"], det["families"]
    bench = load("benchmarks.json")
    check_ids(bench, detectors)

    fills = {
        "benchmark_banner": render_benchmark_banner(bench),
        "detector_frame": render_frame(bench, detectors, families),
        "parser_count": str(len(load("parsers.json")["parsers"])),
        "detector_count": str(len(detectors)),
        "aggregator_count": str(len(load("aggregators.json")["aggregators"])),
    }

    layout = (SRC / "layout.html").read_text(encoding="utf-8")

    pages: dict[str, str] = {}
    for name, meta in PAGES.items():
        content = (SRC / "pages" / name).read_text(encoding="utf-8")
        for key, value in fills.items():
            content = content.replace("{{" + key + "}}", value)

        page = layout
        page = page.replace("{{title}}", esc(meta["title"]))
        page = page.replace("{{description}}", esc(meta["description"]))
        page = page.replace("{{nav}}", esc(meta["nav"]))
        for nav in ("home", "benchmarks"):
            current = ' aria-current="page"' if meta["nav"] == nav else ""
            page = page.replace("{{nav_" + nav + "}}", current)
        page = page.replace("{{content}}", content)

        leftover = page.find("{{")
        if leftover != -1:
            raise SystemExit(f"{name}: unfilled placeholder near: {page[leftover:leftover + 40]!r}")

        pages[name] = page

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(STATIC, OUT / "static")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    for name, page in pages.items():
        (OUT / name).write_text(page, encoding="utf-8")
        print(f"built {name}")


if __name__ == "__main__":
    build()
