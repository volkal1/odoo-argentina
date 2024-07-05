# -*- coding: utf-8 -*-
##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, _, fields, api, tools
from odoo.exceptions import UserError,ValidationError
from odoo.tools.safe_eval import safe_eval
import datetime
import math

class AccountTax(models.Model):
    _inherit = 'account.tax'

    partner_type = fields.Selection(selection=[('invoicing','Facturacion'),('delivery','Entrega')],string='Tipo de partner')

