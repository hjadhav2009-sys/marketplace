import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { getProductDetails } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileProductDetails } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

export function ProductDetailsScreen({ sku, onBack, onOpenGallery }: { sku: string; onBack: () => void; onOpenGallery: () => void }) {
  const [product, setProduct] = useState<MobileProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getProductDetails(sku)
      .then((response) => {
        if (mounted) {
          setProduct(response.product);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Details failed to load."))
      .finally(() => setLoading(false));

    return () => {
      mounted = false;
    };
  }, [sku]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Details</Text>
          <Text style={styles.sku}>{sku}</Text>
        </View>
        <WorkerButton onPress={onBack} variant="secondary" style={styles.close}>Back</WorkerButton>
      </View>
      {loading ? <LoadingState label="Loading details..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {product ? (
        <View style={styles.card}>
          <View style={styles.imageWrap}>
            {product.mainImageUrl ? <Image source={{ uri: product.mainImageUrl }} resizeMode="contain" style={styles.image} /> : <Text style={styles.noImage}>No image</Text>}
          </View>
          <WorkerButton onPress={onOpenGallery} variant="secondary">Open gallery</WorkerButton>
          <Text style={styles.productTitle}>{product.title ?? "Untitled product"}</Text>
          <View style={styles.pills}>
            {product.category ? <StatusPill label={product.category} /> : null}
            {product.fsn ? <StatusPill label={`FSN ${product.fsn}`} /> : null}
            {product.listingId ? <StatusPill label={`Listing ${product.listingId}`} /> : null}
          </View>
          <Info label="Brand" value={product.brand} />
          <Info label="MRP" value={product.mrp} />
          <Info label="Selling price" value={product.sellingPrice} />
          <Info label="Rating" value={product.rating} />
          <Info label="Reviews" value={product.reviewCount} />
          <Info label="Highlights" value={product.highlights} multiline />
          <Info label="Description" value={product.description} multiline />
          <Info label="Specifications" value={product.specifications} multiline />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Info({ label, value, multiline }: { label: string; value: unknown; multiline?: boolean }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, multiline && styles.multiline]}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: design.colors.background,
    gap: 12,
    padding: 14,
    paddingBottom: 24
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: design.colors.text,
    fontSize: 24,
    fontWeight: design.text.weightBlack
  },
  sku: {
    color: design.colors.textMuted,
    fontSize: 13,
    fontWeight: design.text.weightBold
  },
  close: {
    minHeight: 42
  },
  card: {
    ...design.card,
    gap: 12,
    padding: 14
  },
  imageWrap: {
    ...design.imageSquare,
    borderRadius: design.radius.lg
  },
  image: {
    height: "92%",
    width: "92%"
  },
  noImage: {
    color: design.colors.textMuted,
    fontWeight: design.text.weightBold
  },
  productTitle: {
    color: design.colors.text,
    fontSize: 19,
    fontWeight: design.text.weightBlack,
    lineHeight: 25
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  info: {
    borderTopColor: design.colors.border,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10
  },
  infoLabel: {
    color: design.colors.textMuted,
    fontSize: 12,
    fontWeight: design.text.weightBlack,
    textTransform: "uppercase"
  },
  infoValue: {
    color: design.colors.text,
    fontSize: 15,
    fontWeight: design.text.weightMedium
  },
  multiline: {
    fontWeight: "500",
    lineHeight: 22
  }
});
