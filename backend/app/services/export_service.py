"""Turns report rows into Excel (openpyxl) or PDF (reportlab) files."""

import re
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.timeutil import local_tz


def _cell(value):
    if isinstance(value, bool):
        return "yes" if value else "NO"
    return value


def to_xlsx(title: str, columns: list[tuple[str, str]], rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    # Sheet names cannot contain : \ / ? * [ ] and are limited to 31 chars.
    ws.title = re.sub(r"[:\\/?*\[\]]", " ", title)[:31].strip()
    ws.append([title])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Generated {datetime.now(local_tz()):%Y-%m-%d %H:%M} — KeyFive WMS"])
    ws.append([])
    ws.append([c[1] for c in columns])
    header_row = ws.max_row
    for cell in ws[header_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E79")
    for row in rows:
        ws.append([_cell(row.get(key)) for key, _ in columns])
    for i, (key, label) in enumerate(columns, start=1):
        width = max([len(str(label))] + [len(str(_cell(r.get(key, "")))) for r in rows]) + 2
        ws.column_dimensions[get_column_letter(i)].width = min(width, 45)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf(title: str, columns: list[tuple[str, str]], rows: list[dict]) -> bytes:
    buf = BytesIO()
    page = landscape(A4) if len(columns) > 6 else A4
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title=title)
    styles = getSampleStyleSheet()
    data = [[c[1] for c in columns]] + [[str(_cell(r.get(key, ""))) for key, _ in columns] for r in rows]
    if not rows:
        data.append(["No data"] + [""] * (len(columns) - 1))
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F6FA")]),
    ]))
    doc.build([
        Paragraph(title, styles["Title"]),
        Paragraph(f"Generated {datetime.now(local_tz()):%Y-%m-%d %H:%M} — KeyFive WMS", styles["Normal"]),
        Spacer(1, 6 * mm),
        table,
    ])
    return buf.getvalue()


def barcode_labels_pdf(products: list) -> bytes:
    """A4 sheet of barcode labels (3 x 8) for printing demo products, so they can be scanned at the defense."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    cols, rows = 3, 8
    label_w, label_h = page_w / cols, (page_h - 20 * mm) / rows
    for index, product in enumerate(products):
        pos = index % (cols * rows)
        if index and pos == 0:
            c.showPage()
        col, row = pos % cols, pos // cols
        x = col * label_w + 6 * mm
        y = page_h - 10 * mm - (row + 1) * label_h + 6 * mm
        code = product.barcode
        kind = "EAN13" if code.isdigit() and len(code) == 13 else "Code128"
        drawing = createBarcodeDrawing(kind, value=code, barHeight=14 * mm, humanReadable=True)
        drawing.drawOn(c, x, y + 6 * mm)
        c.setFont("Helvetica", 7)
        c.drawString(x, y, f"{product.code}  {product.product_name[:34]}")
    c.save()
    return buf.getvalue()
