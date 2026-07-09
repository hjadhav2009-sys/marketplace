import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerListingsSummary } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Data = Awaited<ReturnType<typeof getOwnerListingsSummary>>;

export function OwnerListingsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getOwnerListingsSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Listings failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Listings</Text>
      {loading ? <LoadingState label="Loading listing master..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <>
          <View style={styles.metrics}>
            <OwnerMetric label="Total listings" value={data.totalListings} />
            <OwnerMetric label="Active" value={data.activeListings} />
            <OwnerMetric label="Missing image" value={data.missingImageCount} />
            <OwnerMetric label="Recent rows" value={data.latestListingImport?.totalRows ?? 0} />
          </View>
          <OwnerCard title="Latest listing import" subtitle={data.latestListingImport?.updatedAt ?? "No listing import yet"} badge={data.latestListingImport?.status ?? "None"} />
          {data.recentListings.map((listing) => (
            <OwnerCard key={listing.id} title={listing.sku} subtitle={listing.productTitle ?? "Untitled product"} badge={listing.listingStatus ?? "Listing"}>
              <View style={styles.row}>
                <View style={styles.imageBox}>
                  {listing.mainImageUrl ? <Image source={{ uri: listing.mainImageUrl }} resizeMode="contain" style={styles.image} /> : <Text style={styles.noImage}>No image</Text>}
                </View>
                <View style={styles.rowText}>
                  <StatusPill label={listing.mainImageUrl ? "Image mapped" : "Missing image"} tone={listing.mainImageUrl ? "good" : "warn"} />
                  <Text style={styles.muted}>{listing.updatedAt}</Text>
                </View>
              </View>
            </OwnerCard>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: design.spacing.md,
    padding: design.spacing.lg
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: design.spacing.sm
  },
  row: {
    flexDirection: "row",
    gap: design.spacing.md
  },
  imageBox: {
    ...design.imageSquare,
    borderRadius: design.radius.md,
    width: 82
  },
  image: {
    height: "90%",
    width: "90%"
  },
  noImage: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightBold
  },
  rowText: {
    flex: 1,
    gap: design.spacing.sm
  },
  muted: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightMedium
  }
});
