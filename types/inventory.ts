/** Kategoria produktów w magazynie lokalu */
export type Category = {
  id: string
  name: string
  description: string | null
}

/** Produkt na stanie magazynowym lokalu */
export type Product = {
  id: string
  category_id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  image_url: string | null
}
