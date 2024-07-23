# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, fields


class AccountPaymentMethod(models.Model):
    _inherit = 'account.payment.method'

    @api.model
    def _get_payment_method_information(self):
        res = super()._get_payment_method_information()
        res['in_third_party_checks'] = {'mode': 'multi', 'domain': [('type', '=', 'bank')]}
        res['out_third_party_checks'] = {'mode': 'multi', 'domain': [('type', '=', 'bank')]}
        return res

class AccountPaymentMethodLine(models.Model):
    _inherit = 'account.payment.method.line'

    def _compute_available_payment_method_desc(self):
        for rec in self:
            res = ''
            desc = []
            for payment_method in rec.available_payment_method_ids:
                desc.append(payment_method.name)
            if desc:
                res = ','.join(desc)
            rec.available_payment_method_desc = res

    available_payment_method_desc = fields.Char('available_payment_method_desc',compute=_compute_available_payment_method_desc)
