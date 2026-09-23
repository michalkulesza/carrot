from benchmark_unit_amount_parser_v2 import _normalize_expected_qty


def test_unicode_fraction_gold_labels_normalize_to_ascii() -> None:
    assert _normalize_expected_qty("\u00bd") == "1/2"
    assert _normalize_expected_qty("1\u00bd") == "1 1/2"
    assert _normalize_expected_qty("3 \u00bd-2\u215b") == "3 1/2-2 1/8"
    assert _normalize_expected_qty(None) is None
