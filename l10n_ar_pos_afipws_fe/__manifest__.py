{
    "name": "Punto de venta Factura Electrónica Argentina",
    "version": "17.0.1.0.0",
    "category": "Localization/Argentina",
    "sequence": 14,
    "author": "ADHOC SA, Filoquin",
    "license": "AGPL-3",
    "summary": "",
    "depends": [
        "l10n_ar_afipws_fe",
        "point_of_sale",
    ],
    "external_dependencies": {},
    "data": [],
    "demo": [],
    "assets": {
        'point_of_sale._assets_pos': [
            "l10n_ar_pos_afipws_fe/static/src/js/pos_order.js",
            "l10n_ar_pos_afipws_fe/static/src/xml/**/*"
        ]
    },
    "images": [],
    'installable': True,
    "auto_install": False,
    "application": False,
}
