# -*- coding: utf-8 -*-
# License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl.html).
{
    'name': 'Percepciones Ventas - Argentina',
    'version': '17.0.1.0.0',
    'category': 'Accounting',
    'summary': "Percepciones en Ventas - Argentina",
    'depends': ['base','account','l10n_ar','account_tax_python','product','sale','account_move_tax'],
    "data": [
        "security/ir.model.access.csv",
	    "account_view.xml",
        "wizard/wizard_view.xml",
        "data/ir_actions_server_data.xml",
    ],
    'license': 'AGPL-3',
    'installable': True,
    'application': False,
    'post_init_hook': 'post_init_hook',
}

