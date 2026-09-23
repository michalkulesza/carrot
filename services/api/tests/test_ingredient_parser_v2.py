from api.services.ingredient_parser_v2 import parse_ingredient


def test_additive_us_volume_conversion_is_exact() -> None:
    parsed = parse_ingredient("1 tablespoon plus 1 teaspoon sesame seeds")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == ("1 1/3", "tbsp", "sesame seeds", "parsed")


def test_metric_decimal_comma_and_polish_unit() -> None:
    parsed = parse_ingredient("1,2 litra wody")
    assert (parsed.qty, parsed.unit, parsed.name) == ("1.2", "l", "wody")


def test_exact_volume_decimal_becomes_fraction_without_rounding() -> None:
    parsed = parse_ingredient("Oko\u0142o 1,5 szklanki jag\u00f3d")
    assert (parsed.qty, parsed.unit, parsed.name) == ("1 1/2", "cup", "jag\u00f3d")


def test_range_and_slash_fraction_stay_whole() -> None:
    ranged = parse_ingredient("1 to 2 cups flour")
    fraction = parse_ingredient("1/2 cup cornstarch")
    assert (ranged.qty, ranged.unit, ranged.name) == ("1-2", "cup", "flour")
    assert (fraction.qty, fraction.unit, fraction.name) == ("1/2", "cup", "cornstarch")


def test_unicode_source_fraction_and_french_alias() -> None:
    fraction = parse_ingredient("\u00bd cup soy sauce")
    french = parse_ingredient("1 cuill\u00e8re \u00e0 soupe de farine")
    assert (fraction.qty, fraction.unit) == ("1/2", "cup")
    assert (french.qty, french.unit, french.name) == ("1", "tbsp", "de farine")
    french_tsp = parse_ingredient("2 c. \u00e0 caf\u00e9 de tomate")
    assert (french_tsp.unit, french_tsp.name) == ("tsp", "de tomate")


def test_mixed_unicode_fraction_normalizes_to_ascii() -> None:
    parsed = parse_ingredient("1\u00bd-2\u00bd cups flour")
    assert (parsed.qty, parsed.unit) == ("1 1/2-2 1/2", "cup")


def test_count_units_after_ingredient_and_parenthetical_size() -> None:
    garlic = parse_ingredient("4-5 garlic cloves, minced")
    ginger = parse_ingredient("1 (2-inch) piece ginger, finely grated")
    chicken = parse_ingredient("3 chicken breasts, boneless and skinless")
    assert (garlic.qty, garlic.unit, garlic.name, garlic.status) == ("4-5", "clove", "garlic, minced", "parsed")
    assert (ginger.qty, ginger.unit, ginger.name) == ("1", "piece", "(2-inch) ginger, finely grated")
    assert (chicken.qty, chicken.unit, chicken.name, chicken.status) == ("3", None, "chicken breasts, boneless and skinless", "parsed")


def test_quantity_without_canonical_unit_is_parsed() -> None:
    parsed = parse_ingredient("2 onions")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == ("2", None, "onions", "parsed")


def test_alternative_quantities_are_not_selected() -> None:
    parsed = parse_ingredient("10 g fresh yeast, or 5g instant yeast")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        None, None, "10 g fresh yeast, or 5g instant yeast", "uncertain"
    )
    conditional = parse_ingredient("260ml Lukewarm milk 38-40\u00b0C (310ml if you want to skip egg)")
    assert (conditional.qty, conditional.unit, conditional.name, conditional.status) == (
        "260", "ml", "Lukewarm milk 38-40\u00b0C (310ml if you want to skip egg)", "uncertain"
    )


def test_terminal_polish_count_unit_is_recovered() -> None:
    parsed = parse_ingredient("\u017b\u00f3\u0142tka jaj: 2 sztuki")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        "2", "piece", "\u017b\u00f3\u0142tka jaj", "parsed"
    )


def test_embedded_amount_unit_normalizes_name_spacing() -> None:
    parsed = parse_ingredient("Carne: 2.4 kg de diezmillo")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        "2.4", "kg", "Carne: de diezmillo", "parsed"
    )


def test_french_verre_ratio_parses_left_side_and_keeps_source() -> None:
    source = "1 verre de riz basmati \u2192 1,5 verre d\u2019eau"
    parsed = parse_ingredient(source)
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        "1", "cup", "riz basmati", "parsed"
    )
    assert parsed.source_text == source


def test_unsupported_unit_after_parenthetical_is_retained_partial() -> None:
    parsed = parse_ingredient("1 (12-ounce) bag raw broccoli florets")
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        "1", "bag", "raw broccoli florets", "partial"
    )


def test_spanish_cditas_alias_and_multi_ingredient_line_is_uncertain() -> None:
    single = parse_ingredient("1\u00bd cdita de or\u00e9gano")
    assert (single.qty, single.unit, single.name, single.status) == (
        "1 1/2", "tsp", "de or\u00e9gano", "parsed"
    )

    source = (
        "Condimentos: 1\u00bd cditas de or\u00e9gano, 1 cdta de tomillo, "
        "1 cdta de mejorana, 1 cdta de comino, 4 clavos de olor, "
        "10 pimientas negras, 3 pimientas gordas, 1 trocito de canela y "
        "3 hojas de laurel."
    )
    parsed = parse_ingredient(source)
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (
        "1 1/2", "tsp",
        "Condimentos: de or\u00e9gano, 1 cdta de tomillo, 1 cdta de mejorana, "
        "1 cdta de comino, 4 clavos de olor, 10 pimientas negras, "
        "3 pimientas gordas, 1 trocito de canela y 3 hojas de laurel.",
        "uncertain"
    )
