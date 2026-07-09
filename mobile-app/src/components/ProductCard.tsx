import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { MobilePackingSearchResult, MobilePickerGroup } from "../types/mobile";
import { mobileTheme } from "../theme/mobileTheme";
import { StatusPill } from "./StatusPill";
import { WorkerButton } from "./WorkerButton";

type PickerProps = {
  item: MobilePickerGroup;
  onImage: () => void;
  onDetails: () => void;
  onPicked: () => void;
  onProblem: () => void;
  busy?: boolean;
};

type PackingProps = {
  item: MobilePackingSearchResult;
  onImage: () => void;
  onDetails: () => void;
  onPack: () => void;
  onProblem: () => void;
  busy?: boolean;
};

function ProductImage({ uri, onPress }: { uri: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.imageWrap}>
      {uri ? <Image source={{ uri }} resizeMode="contain" style={styles.image} /> : <Text style={styles.noImage}>No image</Text>}
    </Pressable>
  );
}

export function PickerProductCard({ item, onImage, onDetails, onPicked, onProblem, busy }: PickerProps) {
  return (
    <View style={styles.card}>
      <ProductImage uri={item.mainImageUrl} onPress={onImage} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.sku}>{item.sku}</Text>
          <StatusPill label={`Qty ${item.qty}`} tone="good" />
        </View>
        <Text numberOfLines={2} style={styles.title}>{item.title ?? "Untitled product"}</Text>
        <View style={styles.row}>
          <StatusPill label={`Ready ${item.pendingCount}`} />
          <StatusPill label={`Picked ${item.pickedCount}`} tone="good" />
          <StatusPill label={`Problem ${item.problemCount}`} tone={item.problemCount > 0 ? "bad" : "neutral"} />
        </View>
        <View style={styles.row}>
          {item.color ? <StatusPill label={item.color} /> : null}
          {item.size ? <StatusPill label={item.size} /> : null}
          {item.cacheStatus ? <StatusPill label={item.cacheStatus} tone="warn" /> : null}
        </View>
        <WorkerButton onPress={onPicked} loading={busy}>Picked</WorkerButton>
        <View style={styles.actions}>
          <WorkerButton onPress={onDetails} variant="secondary" style={styles.actionButton}>Details</WorkerButton>
          <WorkerButton onPress={onProblem} variant="ghost" style={styles.actionButton}>Problem</WorkerButton>
        </View>
      </View>
    </View>
  );
}

export function PackingProductCard({ item, onImage, onDetails, onPack, onProblem, busy }: PackingProps) {
  const statusTone = item.canPack ? "good" : item.packStatus === "PROBLEM" ? "bad" : "neutral";

  return (
    <View style={styles.card}>
      <ProductImage uri={item.mainImageUrl} onPress={onImage} />
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.sku}>{item.sku}</Text>
          <StatusPill label={item.packStatus} tone={statusTone} />
        </View>
        <Text numberOfLines={2} style={styles.title}>{item.title ?? "Untitled product"}</Text>
        <Text style={styles.meta}>Qty {item.qty}  {item.trackingId ?? item.awb ?? "No AWB"}</Text>
        <View style={styles.row}>
          {item.color ? <StatusPill label={item.color} /> : null}
          {item.size ? <StatusPill label={item.size} /> : null}
          <StatusPill label={item.marketplace} />
        </View>
        <WorkerButton onPress={onPack} disabled={!item.canPack} loading={busy}>Pack</WorkerButton>
        <View style={styles.actions}>
          <WorkerButton onPress={onDetails} variant="secondary" style={styles.actionButton}>Details</WorkerButton>
          <WorkerButton onPress={onProblem} variant="ghost" style={styles.actionButton}>Problem</WorkerButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...mobileTheme.card,
    overflow: "hidden"
  },
  imageWrap: {
    ...mobileTheme.imageSquare
  },
  image: {
    height: "92%",
    width: "92%"
  },
  noImage: {
    color: mobileTheme.colors.textMuted,
    fontSize: 15,
    fontWeight: "800"
  },
  body: {
    gap: 12,
    padding: 14
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  sku: {
    color: mobileTheme.colors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: "900"
  },
  title: {
    color: mobileTheme.colors.textSubtle,
    fontSize: 15,
    lineHeight: 21
  },
  meta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actions: {
    flexDirection: "row",
    gap: 10
  },
  actionButton: {
    flex: 1
  }
});
