"""The demo catalog is shown in Russian and Kazakh from i18n/catalog.txt: every seeded name needs a block there."""

import pathlib

from app.seed import CATEGORIES, PRODUCTS

CATALOG_TABLE = pathlib.Path(__file__).resolve().parents[2] / "i18n" / "catalog.txt"


def translated_texts() -> set[str]:
    """The English line of every block (en / ru / kk) of the table."""
    lines = [l for l in CATALOG_TABLE.read_text(encoding="utf-8").splitlines() if not l.startswith("#")]
    blocks = "\n".join(lines).split("\n\n")
    return {block.strip().splitlines()[0] for block in blocks if block.strip()}


def test_every_seeded_category_product_and_description_is_translated():
    texts = translated_texts()
    seeded = set(CATEGORIES) | {p[0] for p in PRODUCTS} | {p[5] for p in PRODUCTS}
    assert sorted(seeded - texts) == []


def test_the_table_has_no_leftovers_from_renamed_products():
    seeded = set(CATEGORIES) | {p[0] for p in PRODUCTS} | {p[5] for p in PRODUCTS}
    assert sorted(translated_texts() - seeded) == []
