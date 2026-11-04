import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart'
import BathtubOutlinedIcon from '@mui/icons-material/BathtubOutlined'
import BedOutlinedIcon from '@mui/icons-material/BedOutlined'
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import KitchenOutlinedIcon from '@mui/icons-material/KitchenOutlined'
import LocalLaundryServiceOutlinedIcon from '@mui/icons-material/LocalLaundryServiceOutlined'
import { Box, Button, Card, CardActionArea, CardActions, CardContent, Chip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import type { ProductPublic } from '@/api/types'
import { useCart } from '@/cart/CartContext'
import { useNotify } from '@/components/Notify'
import { formatMoney } from '@/format'

const CATEGORY_LOOK: Record<string, { icon: ReactNode; color: string }> = {
  Kitchen: { icon: <KitchenOutlinedIcon />, color: '#e07a1f' },
  Cleaning: { icon: <CleaningServicesOutlinedIcon />, color: '#1f77b4' },
  Bathroom: { icon: <BathtubOutlinedIcon />, color: '#17a2b8' },
  Laundry: { icon: <LocalLaundryServiceOutlinedIcon />, color: '#6f42c1' },
  'Home textile': { icon: <BedOutlinedIcon />, color: '#2e7d32' },
}

export function categoryLook(name: string) {
  return CATEGORY_LOOK[name] ?? { icon: <HomeOutlinedIcon />, color: '#607d8b' }
}

/** Product pictures are not stored yet (open question in the plan), so a category illustration is shown. */
export function ProductPicture({ category, height = 140 }: { category: string; height?: number }) {
  const look = categoryLook(category)
  return (
    <Box
      sx={{
        height,
        display: 'grid',
        placeItems: 'center',
        color: look.color,
        background: `linear-gradient(135deg, ${look.color}22, ${look.color}0a)`,
        '& svg': { fontSize: height / 2.4 },
      }}
    >
      {look.icon}
    </Box>
  )
}

export function ProductCard({ product }: { product: ProductPublic }) {
  const { add } = useCart()
  const notify = useNotify()
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea component={RouterLink} to={`/catalog/${product.id}`} sx={{ flex: 1, alignItems: 'stretch' }}>
        <ProductPicture category={product.category.name} />
        <CardContent>
          <Typography variant="caption" color="text.secondary">
            {product.category.name}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3, minHeight: '2.6em' }}>
            {product.product_name}
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(product.unit_price)}
            </Typography>
            <Chip
              size="small"
              label={product.in_stock ? 'In stock' : 'Out of stock'}
              color={product.in_stock ? 'success' : 'default'}
              variant="outlined"
            />
          </Box>
        </CardContent>
      </CardActionArea>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<AddShoppingCartIcon />}
          disabled={!product.in_stock}
          onClick={() => {
            add(product)
            notify.success(`${product.product_name} added to cart`)
          }}
        >
          Add to cart
        </Button>
      </CardActions>
    </Card>
  )
}
