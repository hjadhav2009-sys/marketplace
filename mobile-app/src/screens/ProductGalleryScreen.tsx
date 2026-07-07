import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getProductImages } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { WorkerButton } from "../components/WorkerButton";

export function ProductGalleryScreen({ sku, onBack }: { sku: string; onBack: () => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getProductImages(sku)
      .then((response) => {
        if (!mounted) {
          return;
        }

        const gallery = response.images.gallery.length
          ? response.images.gallery
          : response.images.mainImageUrl
            ? [response.images.mainImageUrl]
            : [];
        setImages(gallery);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Images failed to load."))
      .finally(() => setLoading(false));

    return () => {
      mounted = false;
    };
  }, [sku]);

  function next(delta: number) {
    setSelected((current) => {
      if (images.length === 0) {
        return 0;
      }

      return (current + delta + images.length) % images.length;
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Images</Text>
          <Text style={styles.sku}>{sku}</Text>
        </View>
        <WorkerButton onPress={onBack} variant="secondary" style={styles.close}>Close</WorkerButton>
      </View>
      {loading ? <LoadingState label="Loading images..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error ? (
        <>
          <View style={styles.mainImage}>
            {images[selected] ? <Image source={{ uri: images[selected] }} resizeMode="contain" style={styles.image} /> : <Text style={styles.noImage}>No image available</Text>}
          </View>
          <View style={styles.controls}>
            <WorkerButton onPress={() => next(-1)} variant="secondary" disabled={images.length < 2}>Previous</WorkerButton>
            <WorkerButton onPress={() => next(1)} variant="secondary" disabled={images.length < 2}>Next</WorkerButton>
          </View>
          <FlatList
            contentContainerStyle={styles.thumbs}
            data={images}
            horizontal
            keyExtractor={(item, index) => `${item}:${index}`}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => setSelected(index)} style={[styles.thumb, selected === index && styles.thumbActive]}>
                <Image source={{ uri: item }} resizeMode="contain" style={styles.thumbImage} />
              </Pressable>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 12,
    padding: 14
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  sku: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800"
  },
  close: {
    minHeight: 42
  },
  mainImage: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden"
  },
  image: {
    height: "94%",
    width: "94%"
  },
  noImage: {
    color: "#64748b",
    fontWeight: "800"
  },
  controls: {
    flexDirection: "row",
    gap: 10
  },
  thumbs: {
    gap: 10,
    paddingVertical: 4
  },
  thumb: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    width: 76
  },
  thumbActive: {
    borderColor: "#0f172a",
    borderWidth: 2
  },
  thumbImage: {
    height: "90%",
    width: "90%"
  }
});
