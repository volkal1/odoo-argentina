# -*- coding: utf-8 -*-
##############################################################################
# For copyright and license notices, see __manifest__.py file in module root
# directory
##############################################################################
from odoo import models, _, fields, api, tools
from odoo.exceptions import UserError,ValidationError
from odoo.tools.safe_eval import safe_eval
import datetime
from datetime import date

from pyafipws.ws_sr_padron import WSSrPadronA5

class AfipwsConnection(models.Model):
    _inherit = "afipws.connection"

    afip_ws = fields.Selection(selection_add=[('ws_sr_constancia_inscripcion','Consulta Constancia de Inscripcion')],ondelete={'ws_sr_constancia_inscripcion': 'cascade'})


class ResPartner(models.Model):
    _inherit = "res.partner"

    def parce_census_vals(self, census):

        # porque imp_iva activo puede ser S o AC
        imp_iva = census.imp_iva
        if imp_iva == 'S':
            imp_iva = 'AC'
        elif imp_iva == 'N':
            # por ej. monotributista devuelve N
            imp_iva = 'NI'
        
        vals = {
            'name': census.denominacion,
            'street': census.direccion,
            'city': census.localidad,
            'zip': census.cod_postal,
            'imp_iva_padron': imp_iva,
            'last_update_census': fields.Date.today(),
        }

        # padron.idProvincia

        ganancias_inscripto = [10, 11]
        ganancias_exento = [12]
        if set(ganancias_inscripto) & set(census.impuestos):
            vals['imp_ganancias_padron'] = 'AC'
        elif set(ganancias_exento) & set(census.impuestos):
            vals['imp_ganancias_padron'] = 'EX'
        elif census.monotributo == 'S':
            vals['imp_ganancias_padron'] = 'NC'
        else:
            _logger.info(
                "We couldn't get impuesto a las ganancias from padron, you"
                "must set it manually")

        if census.provincia:
            # depending on the database, caba can have one of this codes
            caba_codes = ['C', 'CABA', 'ABA']
            # if not localidad then it should be CABA.
            if not census.localidad:
                state = self.env['res.country.state'].search([
                    ('code', 'in', caba_codes),
                    ('country_id.code', '=', 'AR')], limit=1)
            # If localidad cant be caba
            else:
                state = self.env['res.country.state'].search([
                    ('name', 'ilike', census.provincia),
                    ('code', 'not in', caba_codes),
                    ('country_id.code', '=', 'AR')], limit=1)
            if state:
                vals['state_id'] = state.id

        if imp_iva == 'NI' and census.monotributo == 'S':
            vals['l10n_ar_afip_responsibility_type_id'] = self.env.ref(
                'l10n_ar.res_RM').id
        elif imp_iva == 'AC':
            vals['l10n_ar_afip_responsibility_type_id'] = self.env.ref(
                'l10n_ar.res_IVARI').id
        elif imp_iva == 'EX':
            vals['l10n_ar_afip_responsibility_type_id'] = self.env.ref(
                'l10n_ar.res_IVAE').id
        else:
            _logger.info(
                "We couldn't infer the AFIP responsability from padron, you"
                "must set it manually.")

        return vals


    def check_padron(self):
        self.ensure_one()
        cuit = self.ensure_vat()

        # GET COMPANY
        # if there is certificate for user company, use that one, if not
        # use the company for the first certificate found
        company = self.env.user.company_id
        env_type = company._get_environment_type()
        try:
            certificate = company.get_key_and_certificate(
                company._get_environment_type())
        except Exception:
            certificate = self.env['afipws.certificate'].search([
                ('alias_id.type', '=', env_type),
                ('state', '=', 'confirmed'),
            ], limit=1)
            if not certificate:
                raise UserError(_(
                    'Not confirmed certificate found on database'))
            company = certificate.alias_id.company_id

        # consultamos a5 ya que extiende a4 y tiene validez de constancia
        #padron = company.get_connection('ws_sr_padron_a5').connect()
        padron = company.get_connection('ws_sr_constancia_inscripcion').connect()
        error_msg = _(
            'No pudimos actualizar desde padron afip al partner %s (%s).\n'
            'Recomendamos verificar manualmente en la página de AFIP.\n'
            'Obtuvimos este error: %s')
        try:
            padron.Consultar(cuit)
        except Exception as e:
            raise UserError(error_msg % (self.name, cuit, e))

        if not padron.denominacion or padron.denominacion == ', ':
            raise UserError(error_msg % (
                self.name, cuit, 'La afip no devolvió nombre'))
        vals = self.parce_census_vals(padron)
        del vals['imp_iva_padron']
        del vals['last_update_census']
        del vals['imp_ganancias_padron']
        self.write(vals)
        return vals
