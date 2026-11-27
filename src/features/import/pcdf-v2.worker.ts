import { PcdfV2Error, validatePcdfV2, type PcdfV2Preview } from "@/data/pcdfV2";

export type PcdfV2Files = { csv: File; attachments: File[] };
export type PcdfV2WorkerResult = { preview: PcdfV2Preview } | { error: string };

self.onmessage = async (event: MessageEvent<PcdfV2Files>) => {
  try {
    const preview = await validatePcdfV2(event.data.csv, event.data.attachments);
    self.postMessage({ preview } satisfies PcdfV2WorkerResult);
  } catch (error) {
    self.postMessage({ error: error instanceof PcdfV2Error ? error.message : "Falha ao conferir o pacote PCDF v2." } satisfies PcdfV2WorkerResult);
  }
};
