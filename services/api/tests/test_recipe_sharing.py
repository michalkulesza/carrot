from api.routes import recipes


def test_recipe_routes_do_not_expose_the_removed_personal_link_endpoint() -> None:
    route_paths = {route.path for route in recipes.router.routes}

    assert "/recipes/{recipe_id}/link-to-personal" not in route_paths
