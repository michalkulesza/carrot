from api.services.html_cleaner import clean_html_body


def test_cleaner_removes_recipe_checkbox_labels() -> None:
    cleaned = clean_html_body("<main><label><input type='checkbox'/>▢</label><p>1 onion</p></main>")

    assert "checkbox" not in cleaned
    assert "▢" not in cleaned
    assert "1 onion" in cleaned


def test_cleaner_preserves_recipe_servings_controls() -> None:
    cleaned = clean_html_body("""
        <main><input type="text" class="wprm-recipe-servings wprm-recipe-servings-31673"
        value="4" aria-label="Adjust recipe servings"><span class="wprm-recipe-servings">4</span></main>
    """)

    assert 'class="wprm-recipe-servings wprm-recipe-servings-31673"' in cleaned
    assert 'value="4"' in cleaned
    assert '<span class="wprm-recipe-servings">4</span>' in cleaned


def test_cleaner_preserves_recipe_card_headers_and_recipe_jsonld() -> None:
    cleaned = clean_html_body("""
        <html><head><script type="application/ld+json">{"@type":"Recipe","nutrition":{"calories":"646"}}</script></head>
        <body><header class="site-header">Navigation</header><main><header class="tasty-recipes-header">Total Time: 50 minutes</header></main></body></html>
    """)

    assert "Navigation" not in cleaned
    assert "Total Time: 50 minutes" in cleaned
    assert '"calories":"646"' in cleaned


def test_cleaner_preserves_bbc_good_food_recipe_payload() -> None:
    cleaned = clean_html_body('''
        <html><head><script id="__POST_CONTENT__" type="application/json">{"client":"bbcgoodfood","servings":"Serves 4"}</script></head>
        <body><main><p>Recipe</p></main></body></html>
    ''')

    assert 'id="__POST_CONTENT__"' in cleaned
    assert '"servings":"Serves 4"' in cleaned


def test_cleaner_preserves_olive_magazine_recipe_payload() -> None:
    cleaned = clean_html_body('''
        <html><head><script id="__POST_CONTENT__" type="application/json">{"client":"olivemagazine","servings":"Makes 16"}</script></head>
        <body><main><p>Recipe</p></main></body></html>
    ''')

    assert 'id="__POST_CONTENT__"' in cleaned
    assert '"client":"olivemagazine"' in cleaned


def test_cleaner_preserves_recipe_structure_and_component_links() -> None:
    cleaned = clean_html_body("""
        <html><body>
          <nav>Recipes</nav>
          <article class="recipe-content">
            <h1>Chicken with sauce</h1>
            <h2>Main</h2><ul><li>1 chicken</li></ul>
            <h2>Sauce</h2><ul><li><a href="/sauce">Tomato sauce</a></li></ul>
            <h2>Instructions</h2><ol><li>Cook the chicken.</li></ol>
          </article>
          <footer>Copyright</footer>
        </body></html>
    """)

    assert "<article" in cleaned
    assert "<h1>Chicken with sauce</h1>" in cleaned
    assert "<h2>Sauce</h2>" in cleaned
    assert "<ul><li><a href=\"/sauce\">Tomato sauce</a></li></ul>" in cleaned
    assert "<ol><li>Cook the chicken.</li></ol>" in cleaned
    assert "Recipes" not in cleaned
    assert "Copyright" not in cleaned


def test_cleaner_removes_noise_without_dropping_structural_theme_containers() -> None:
    cleaned = clean_html_body("""
        <body class="content-sidebar">
          <main class="content-sidebar-wrap"><article><h1>Beef stew</h1><p>2 carrots</p></article></main>
          <div class="newsletter-popup">Subscribe</div>
          <div id="cookie-banner">Accept cookies</div>
          <script>alert('no')</script><style>.x { color: red; }</style>
        </body>
    """)

    assert "Beef stew" in cleaned
    assert "2 carrots" in cleaned
    assert "Subscribe" not in cleaned
    assert "Accept cookies" not in cleaned
    assert "alert" not in cleaned


def test_cleaner_handles_nested_noise_elements() -> None:
    cleaned = clean_html_body("""
        <body><main><h1>Soup</h1><aside><div class="newsletter-popup">Subscribe</div></aside></main></body>
    """)

    assert "Soup" in cleaned
    assert "Subscribe" not in cleaned


def test_cleaner_removes_unsafe_attributes_and_empty_elements() -> None:
    cleaned = clean_html_body("""
        <body><main><h1 data-testid="title">Soup</h1><p></p>
        <a href="/recipe" onclick="evil()" data-id="1">Full recipe</a>
        <img src="soup.jpg" alt="Soup" onerror="evil()"></main></body>
    """)

    assert "data-testid" not in cleaned
    assert "onclick" not in cleaned
    assert "onerror" not in cleaned
    assert "<p></p>" not in cleaned
    assert "<a href=\"/recipe\">Full recipe</a>" in cleaned
    assert "<img alt=\"Soup\" src=\"soup.jpg\"/>" in cleaned


def test_cleaner_returns_empty_html_for_empty_input() -> None:
    assert clean_html_body("   ") == ""


def test_cleaner_strips_data_uri_images() -> None:
    cleaned = clean_html_body(
        '<main><img src="data:image/svg+xml;base64,AAAA"><img src="https://x.test/a.jpg" alt="a"><p>1 onion</p></main>'
    )

    assert "data:" not in cleaned
    assert "https://x.test/a.jpg" in cleaned
    assert "1 onion" in cleaned
