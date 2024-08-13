/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Order } from "@point_of_sale/app/store/models";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PosStore.prototype, {
    getReceiptHeaderData(order) {
        const result = super.getReceiptHeaderData(...arguments);
        result.partner = order.partner
        result.order_data = order.move_vals?.[0]
        result.env = this.env.services;
        return result;
    },
})

const get_taxed_lst_unit_price_override = (o) => {
    const lstPrice = o.compute_fixed_price(o.get_lst_price());
    const product = o.get_product();
    const taxesIds = product.taxes_id;
    const productTaxes = o.pos.get_taxes_after_fp(taxesIds, o.order.fiscal_position);
    const unitPrices = o.compute_all(productTaxes, lstPrice, 1, o.pos.currency.rounding);
    if (o.pos.config.iface_tax_included === "total") {
        return unitPrices.total_included;
    } else {
        return unitPrices.total_excluded;
    }
};

patch(Order.prototype, {
    async setup() {
        await super.setup(...arguments);
    },
    export_for_printing() {
        console.log(this);
        var receipt = super.export_for_printing(this);
        if (this.to_invoice && this.move_vals) {
            const aditionalData = this.move_vals[0]
            const companyData = this.company_sv[0]
            const codeWriter = new window.ZXing.BrowserQRCodeSvgWriter();
            const address = aditionalData.afip_qr_code
            let qr_code_svg = new XMLSerializer().serializeToString(codeWriter.write(address, 150, 150));
            const _qr = 'data:image/svg+xml;base64,' + window.btoa(qr_code_svg);

            receipt.l10n_ar_afip_qr_image = _qr;
            receipt.afip_auth_mode = aditionalData.afip_auth_mode;
            receipt.afip_auth_code = aditionalData.afip_auth_code;
            receipt.l10n_ar_afip_auth_code = aditionalData.afip_auth_code;
            receipt.afip_auth_code_due = aditionalData.afip_auth_code_due;
            receipt.l10n_ar_afip_auth_code_due = aditionalData.afip_auth_code_due;
            receipt.account_move = aditionalData.account_move;
            receipt.pos_reference = aditionalData.ref;
            receipt.company_id = aditionalData.company_id;
            receipt.partner = this.partner
            receipt.invoice_id = aditionalData.id
            receipt.company = { ...companyData };
            receipt.l10n_ar_gross_income_number = companyData.l10n_ar_gross_income_number;
            receipt.additional_data = { ...aditionalData };
            receipt.document_type_sv = this.document_type_sv[0]
            receipt.env = this.env.services;

            receipt.orderlines = this.orderlines.map(o => {
                if (receipt.document_type_sv.l10n_ar_letter === 'A')
                    return {
                        productName: o.get_full_product_name(),
                        price: o.get_discount_str() === "100"
                            ? // free if the discount is 100
                            _t("Free")
                            : (o.comboLines && o.comboLines.length > 0)
                                ? // empty string if it is a combo parent line
                                ""
                                : o.env.utils.formatCurrency(o.get_price_without_tax(), o.currency),
                        qty: o.get_quantity_str(),
                        unit: o.get_unit().name,
                        unitPrice: o.env.utils.formatCurrency(o.get_all_prices(1).priceWithoutTax),
                        oldUnitPrice: o.env.utils.formatCurrency(o.display_discount_policy() === "without_discount" &&
                            o.env.utils.roundCurrency(o.get_all_prices(1).priceWithoutTax()) <
                            o.env.utils.roundCurrency(get_taxed_lst_unit_price_override(o)) &&
                            get_taxed_lst_unit_price_override(o)),
                        discount: o.get_discount_str(),
                        customerNote: o.get_customer_note(),
                        internalNote: o.getNote(),
                        comboParent: o.comboParent?.get_full_product_name(),
                        pack_lot_lines: o.get_lot_lines(),
                        price_without_discount: o.env.utils.formatCurrency(
                            o.get_all_prices(1).priceWithoutTaxBeforeDiscount
                        ),
                        attributes: o.attribute_value_ids
                            ? o.findAttribute(o.attribute_value_ids, o.custom_attribute_value_ids)
                            : [],
                    }
                else
                    return o.getDisplayData()
            }
            )
        }
        console.log(receipt);
        return receipt
    }
});

patch(PaymentScreen.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.afip_invoice_data = {};
        this.orders_ids = [];
    },
    async _finalizeValidation() {
        if (this.currentOrder.is_paid_with_cash() || this.currentOrder.get_change()) {
            this.hardwareProxy.openCashbox();
        }

        this.currentOrder.date_order = luxon.DateTime.now();
        for (const line of this.paymentLines) {
            if (!line.amount === 0) {
                this.currentOrder.remove_paymentline(line);
            }
        }
        this.currentOrder.finalized = true;

        this.env.services.ui.block();
        let syncOrderResult;
        try {
            // 1. Save order to server.
            syncOrderResult = await this.pos.push_single_order(this.currentOrder);
            if (!syncOrderResult) {
                return;
            }
            // 2. Invoice.
            if (this.shouldDownloadInvoice() && this.currentOrder.is_to_invoice()) {
                if (syncOrderResult[0]?.account_move) {
                    await this.report.doAction("account.account_invoices", [
                        syncOrderResult[0].account_move,
                    ]);
                    // aqui agregamos la sobreescritura
                    this.currentOrder.move_order_id = syncOrderResult[0].account_move
                    // terminamos sobreescritura
                } else {
                    throw {
                        code: 401,
                        message: "Backend Invoice",
                        data: { order: this.currentOrder },
                    };
                }
            }
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                this.pos.showScreen(this.nextScreen);
                Promise.reject(error);
                return error;
            } else {
                throw error;
            }
        } finally {
            this.env.services.ui.unblock();
        }

        // 3. Post process.
        if (
            syncOrderResult &&
            syncOrderResult.length > 0 &&
            this.currentOrder.wait_for_push_order()
        ) {
            await this.postPushOrderResolve(syncOrderResult.map((res) => res.id));
        }

        if (this.currentOrder.move_order_id) {
            this.currentOrder.move_vals = await this.orm.call(
                'account.move',
                'read',
                [this.currentOrder.move_order_id
                    , [
                    //'l10n_latam_document_type_id'
                ]
                ]
            )
            this.currentOrder.company_sv = await this.orm.call(
                'res.company',
                'read',
                [this.pos.company.id
                    , [
                    // 'l10n_ar_afip_qr_image',
                ]
                ]
            )
            this.currentOrder.document_type_sv = await this.orm.call(
                'l10n_latam.document.type',
                'read',
                [this.currentOrder.move_vals[0].l10n_latam_document_type_id[0]
                    , [
                    // 'l10n_ar_afip_qr_image',
                ]
                ]
            )
        }
        await this.afterOrderValidation(!!syncOrderResult && syncOrderResult.length > 0);
    },
    // async _get_move_vals(id) {
    //     try {
    //         let vals = self.orm.call(
    //             'account.move',
    //             'get_move_vals',
    //             [id
    //                 // , [
    //                 //     'l10n_ar_afip_qr_image',
    //                 //     'afip_auth_mode',
    //                 //     'afip_auth_code',
    //                 //     'afip_auth_code_due',
    //                 //     'account_move',
    //                 //     'pos_reference',
    //                 //     'company_id']
    //             ]
    //         )
    //         // let vals = await this.rpc({
    //         //     model: 'account.move',
    //         //     method: 'get_move_vals',
    //         //     args: [id],
    //         // });
    //         return vals || {};
    //     } catch (e) {
    //         console.log(e);
    //         return {};
    //     }
    // }
});
