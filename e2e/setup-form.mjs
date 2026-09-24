// Fixture for the env e2e, in the user's personal test environment: two text
// columns on Contact, "SIN" and "Bank account", and a Contact main form
// "Sealed Input E2E" that shows the name with the stock control and the two
// columns with Sealed Input (SIN with the SIN validation, bank account with a
// 12 character cap). SIN is shown in every label situation: wide and narrow
// column, section labels left and on top, cell label shown and hidden, and in
// a two-column section (labels on the left) where the cell spans both columns
// above a row of two stock cells.
// Publishes and creates a test contact "Jane Sealed Input E2E" whose bank
// account holds a made-up number and whose SIN is empty.
// No real personal data is involved.
import { openOrg, webApi } from './browser.mjs';

const FORM_NAME = 'Sealed Input E2E';
const FORM_ID = '5ea1ed00-aaaa-4bbb-8ccc-000000000003';
const SIN = 'cmtl_sin';
const BANK = 'cmtl_bankaccount';
const TEST_LAST_NAME = 'Sealed Input E2E';
const BANK_VALUE = '0041234567'; // made up

async function ensureTextColumn(page, schema, label, description, maxLength) {
  const attrs = await webApi(page, 'GET', `EntityDefinitions(LogicalName='contact')/Attributes?$select=LogicalName&$filter=LogicalName eq '${schema}'`);
  if (attrs.data.value.length) return;
  await webApi(page, 'POST', `EntityDefinitions(LogicalName='contact')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schema,
    MaxLength: maxLength,
    FormatName: { Value: 'Text' },
    RequiredLevel: { Value: 'None' },
    DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: label, LanguageCode: 1033 }] },
    Description: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: 1033 }] },
  });
}

export async function setupForm(page) {
  // 1. Registered control name.
  const cc = await webApi(page, 'GET', `customcontrols?$select=name,version&$filter=contains(name,'KK.SealedInput')`);
  const control = cc.data.value[0];
  if (!control) throw new Error('KK.SealedInput is not registered in the env; run pac pcf push first');
  const ctrlName = control.name;

  // 2. Columns.
  await ensureTextColumn(page, SIN, 'SIN', 'Sealed Input e2e fixture column', 20);
  await ensureTextColumn(page, BANK, 'Bank account', 'Sealed Input e2e fixture column', 20);

  // 3. Form XML: first name, last name (stock), SIN and Bank account (Sealed Input).
  const TEXT_CLASSID = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}';
  const bankCtrlId = '{5ea1ed00-aaaa-4bbb-8ccc-000000000022}';
  const sealed = (params) =>
    [0, 1, 2]
      .map((ff) => `<customControl formFactor="${ff}" name="${ctrlName}"><parameters>${params}</parameters></customControl>`)
      .join('');
  const sinParams = `<value>${SIN}</value><characters static="true" type="Enum">digits</characters><validation static="true" type="Enum">sin</validation><maxLength static="true" type="Whole.None">0</maxLength><revealMs static="true" type="Whole.None">1000</revealMs>`;
  const bankParams = `<value>${BANK}</value><characters static="true" type="Enum">digits</characters><validation static="true" type="Enum">none</validation><maxLength static="true" type="Whole.None">12</maxLength><revealMs static="true" type="Whole.None">1000</revealMs>`;
  // One cell; colspan > 1 makes it span that many of its section's columns.
  const cellOnly = (id, label, control, showlabel = true, colspan = 1) =>
    `<cell id="${id}" showlabel="${showlabel}" locklevel="0"${colspan > 1 ? ` colspan="${colspan}"` : ''}><labels><label description="${label}" languagecode="1033" /></labels>${control}</cell>`;
  const rowOf = (...cells) => `<row>${cells.join('')}</row>`;
  const cell = (...args) => rowOf(cellOnly(...args));
  // Every label situation the control handles, on one form: a wide column
  // (fields side by side) and a narrow one (stacked), each with a section
  // whose labels are on the left and one whose labels are on top, and in
  // every section a SIN cell with the label hidden next to a labelled one.
  // Plus a two-column section with labels on the left: a row of two stock
  // cells, then SIN, Bank account and SIN (label hidden) each spanning both
  // columns, so the control's two-column layout can be measured against the
  // stock cells above it.
  // Ids: sections 61-65, cells 40-55, controls 21-32.
  const ids = {
    sinWideLeft: '{5ea1ed00-aaaa-4bbb-8ccc-000000000021}',
    bankWideLeft: bankCtrlId,
    sinNarrowTop: '{5ea1ed00-aaaa-4bbb-8ccc-000000000023}',
    sinWideLeftHidden: '{5ea1ed00-aaaa-4bbb-8ccc-000000000024}',
    sinWideTop: '{5ea1ed00-aaaa-4bbb-8ccc-000000000025}',
    sinWideTopHidden: '{5ea1ed00-aaaa-4bbb-8ccc-000000000026}',
    sinNarrowTopHidden: '{5ea1ed00-aaaa-4bbb-8ccc-000000000027}',
    sinNarrowLeft: '{5ea1ed00-aaaa-4bbb-8ccc-000000000028}',
    sinNarrowLeftHidden: '{5ea1ed00-aaaa-4bbb-8ccc-000000000029}',
    sinTwoColLeft: '{5ea1ed00-aaaa-4bbb-8ccc-000000000030}',
    bankTwoColLeft: '{5ea1ed00-aaaa-4bbb-8ccc-000000000031}',
    sinTwoColLeftHidden: '{5ea1ed00-aaaa-4bbb-8ccc-000000000032}',
  };
  const cellId = (cellNo) => `{5ea1ed00-aaaa-4bbb-8ccc-0000000000${cellNo}}`;
  const sinCell = (cellNo, label, ctrl, showlabel = true, colspan = 1) =>
    cell(cellId(cellNo), label, `<control id="${ctrl}" classid="${TEXT_CLASSID}" datafieldname="${SIN}" disabled="false" uniqueid="${ctrl}" />`, showlabel, colspan);
  const bankControl = (ctrl) => `<control id="${ctrl}" classid="${TEXT_CLASSID}" datafieldname="${BANK}" disabled="false" uniqueid="${ctrl}" />`;
  const section = (no, name, label, position, labelwidth, rows, columns = 1) =>
    `<section name="${name}" id="{5ea1ed00-aaaa-4bbb-8ccc-0000000000${no}}" showlabel="true" showbar="false" IsUserDefined="0" layout="varwidth" columns="${columns}" labelwidth="${labelwidth}" celllabelposition="${position}" locklevel="0">` +
    `<labels><label description="${label}" languagecode="1033" /></labels><rows>${rows}</rows></section>`;
  const formxml =
    `<form showImage="true">` +
    `<tabs><tab name="general" id="{5ea1ed00-aaaa-4bbb-8ccc-000000000060}" IsUserDefined="0" verticallayout="true" showlabel="true" expanded="true" locklevel="0">` +
    `<labels><label description="Payment details" languagecode="1033" /></labels><columns>` +
    `<column width="66%"><sections>` +
    section(61, 'wideLeft', 'Wide column, labels on the left', 'Left', 180,
      cell('{5ea1ed00-aaaa-4bbb-8ccc-000000000040}', 'First Name', `<control id="firstname" classid="${TEXT_CLASSID}" datafieldname="firstname" disabled="false" />`) +
      cell('{5ea1ed00-aaaa-4bbb-8ccc-000000000041}', 'Last Name', `<control id="lastname" classid="${TEXT_CLASSID}" datafieldname="lastname" disabled="false" />`) +
      sinCell(42, 'SIN', ids.sinWideLeft) +
      cell('{5ea1ed00-aaaa-4bbb-8ccc-000000000043}', 'Bank account', bankControl(bankCtrlId)) +
      sinCell(45, 'SIN (label hidden)', ids.sinWideLeftHidden, false)) +
    section(63, 'wideTop', 'Wide column, labels on top', 'Top', 180,
      sinCell(46, 'SIN', ids.sinWideTop) +
      sinCell(47, 'SIN (label hidden)', ids.sinWideTopHidden, false)) +
    section(65, 'twoColLeft', 'Two columns, labels on the left', 'Left', 115,
      rowOf(
        cellOnly(cellId(51), 'First Name', `<control id="firstname_twocol" classid="${TEXT_CLASSID}" datafieldname="firstname" disabled="false" />`),
        cellOnly(cellId(52), 'Last Name', `<control id="lastname_twocol" classid="${TEXT_CLASSID}" datafieldname="lastname" disabled="false" />`)) +
      sinCell(53, 'SIN', ids.sinTwoColLeft, true, 2) +
      cell(cellId(54), 'Bank account', bankControl(ids.bankTwoColLeft), true, 2) +
      sinCell(55, 'SIN (label hidden)', ids.sinTwoColLeftHidden, false, 2),
      2) +
    `</sections></column>` +
    `<column width="34%"><sections>` +
    section(62, 'narrowTop', 'Narrow column, labels on top', 'Top', 115,
      sinCell(44, 'SIN', ids.sinNarrowTop) +
      sinCell(48, 'SIN (label hidden)', ids.sinNarrowTopHidden, false)) +
    section(64, 'narrowLeft', 'Narrow column, labels on the left', 'Left', 115,
      sinCell(49, 'SIN', ids.sinNarrowLeft) +
      sinCell(50, 'SIN (label hidden)', ids.sinNarrowLeftHidden, false)) +
    `</sections></column>` +
    `</columns></tab></tabs>` +
    `<controlDescriptions>` +
    Object.entries(ids)
      .map(([k, id]) => `<controlDescription forControl="${id}">${sealed(k.startsWith('bank') ? bankParams : sinParams)}</controlDescription>`)
      .join('') +
    `</controlDescriptions>` +
    `</form>`;

  const existing = await webApi(page, 'GET', `systemforms?$select=formid&$filter=name eq '${FORM_NAME}' and objecttypecode eq 'contact'`);
  let formId;
  if (existing.data.value.length) {
    formId = existing.data.value[0].formid;
    await webApi(page, 'PATCH', `systemforms(${formId})`, { formxml });
  } else {
    await webApi(page, 'POST', 'systemforms', {
      formid: FORM_ID,
      name: FORM_NAME,
      description: 'xrm-sealed-input e2e fixture',
      objecttypecode: 'contact',
      type: 2,
      formxml,
      formactivationstate: 1,
    });
    formId = FORM_ID;
  }

  // 4. Publish contact.
  await webApi(page, 'POST', 'PublishXml', { ParameterXml: '<importexportxml><entities><entity>contact</entity></entities></importexportxml>' });

  // 5. Test record: bank account set, SIN empty.
  const found = await webApi(page, 'GET', `contacts?$select=contactid&$filter=lastname eq '${TEST_LAST_NAME}'`);
  let contactId;
  if (found.data.value.length) {
    contactId = found.data.value[0].contactid;
    await webApi(page, 'PATCH', `contacts(${contactId})`, { firstname: 'Jane', [BANK]: BANK_VALUE, [SIN]: null });
  } else {
    const r = await webApi(page, 'POST', 'contacts', { firstname: 'Jane', lastname: TEST_LAST_NAME, [BANK]: BANK_VALUE });
    contactId = r.entityId.match(/\(([^)]+)\)/)[1];
  }

  return { ctrlName, formId, contactId, sin: SIN, bank: BANK, bankValue: BANK_VALUE };
}

if (process.argv[1] && /setup-form\.mjs$/.test(process.argv[1])) {
  const { ctx, page } = await openOrg({ headless: true });
  try { console.log(JSON.stringify(await setupForm(page))); } finally { await ctx.close(); }
}
