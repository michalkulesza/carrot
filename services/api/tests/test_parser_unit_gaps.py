import pytest

from api.services.ingredient_parser_v2 import parse_ingredient
from api.services.unit_variants import convert_ingredient


@pytest.mark.parametrize(
    ("line", "qty", "unit", "name", "status"),
    [
        ("1 copo americano de açúcar", "1", "copo americano", "açúcar", "partial"),
        ("2 copos americanos de leite", "2", "copo americano", "leite", "partial"),
        ("1 copo de requeijão", "1", "copo", "requeijão", "partial"),
        ("1/2 copo de óleo", "1/2", "copo", "óleo", "partial"),
        ("3 copos de caldo de laranja", "3", "copo", "caldo de laranja", "partial"),
        ("meio copo de água", "1/2", "copo", "água", "partial"),
        ("1 bicchiere di latte", "1", "bicchiere", "latte", "partial"),
        ("1 xícara (chá) de açúcar", "1", "cup", "açúcar", "parsed"),
        ("meia xícara (chá) de óleo", "1/2", "cup", "óleo", "parsed"),
        ("meia xícara de leite", "1/2", "cup", "leite", "parsed"),
        ("2 xícaras de chá de farinha", "2", "cup", "farinha", "parsed"),
        ("1 xícara (café) de leite", "1", "xícara (café)", "leite", "partial"),
        ("500 mg de sal", "500", "mg", "sal", "partial"),
        ("2 dl di panna", "2", "dl", "panna", "partial"),
        ("2 c. à café de tomate", "2", "tsp", "tomate", "parsed"),
        ("1 c. à soupe d'huile", "1", "tbsp", "huile", "parsed"),
        ("1 c.à.c de sel", "1", "tsp", "sel", "parsed"),
        ("2 c.à.s de sucre", "2", "tbsp", "sucre", "parsed"),
    ],
)
def test_unit_gaps(line, qty, unit, name, status):
    parsed = parse_ingredient(line)
    assert (parsed.qty, parsed.unit, parsed.name, parsed.status) == (qty, unit, name, status)


def test_native_glass_units_are_never_cups():
    for line in ("1 copo de leite", "2 bicchieri di vino"):
        assert parse_ingredient(line).unit != "cup"


@pytest.mark.parametrize("line", ["1 copo americano de açúcar", "1 bicchiere di latte", "500 mg de sal", "2 dl di panna", "1 xícara (café) de leite"])
@pytest.mark.parametrize("target", ["metric", "imperial"])
def test_variants_leave_native_units_untouched(line, target):
    assert convert_ingredient(line, target) == line
