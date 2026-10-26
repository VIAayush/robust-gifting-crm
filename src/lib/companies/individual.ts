export const INDIVIDUAL_COMPANY_TYPE = 'individual'
export const INDIVIDUAL_NAME_SUFFIX = '(Individual Customer)'

/** B2C buyers get a CRM "company" too; older ones are only recognisable by their name suffix. */
export function isIndividualCompany(company: { name?: string | null; company_type?: string | null }) {
  if (company.company_type === INDIVIDUAL_COMPANY_TYPE) return true
  return Boolean(company.name && company.name.trim().endsWith(INDIVIDUAL_NAME_SUFFIX))
}

type Filterable = {
  or: (filters: string) => Filterable
  not: (column: string, operator: string, value: string) => Filterable
}

/** Narrows a companies query to corporate (non-individual) companies. */
export function excludeIndividualCompanies<Q>(query: Q): Q {
  const q = query as unknown as Filterable
  return q
    .or(`company_type.is.null,company_type.neq.${INDIVIDUAL_COMPANY_TYPE}`)
    .not('name', 'ilike', `%${INDIVIDUAL_NAME_SUFFIX}`) as unknown as Q
}

/** Narrows a companies query to individual (B2C) customers only. */
export function onlyIndividualCompanies<Q>(query: Q): Q {
  const q = query as unknown as Filterable
  return q.or(`company_type.eq.${INDIVIDUAL_COMPANY_TYPE},name.ilike."*${INDIVIDUAL_NAME_SUFFIX}"`) as unknown as Q
}
