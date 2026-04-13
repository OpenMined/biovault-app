HERC2_SITE = bioscript.variant(
    rsid=["rs12913832", "rs60078917"],
    grch37="15:28365618-28365618",
    grch38="15:28120472-28120472",
    ref="A",
    alt="G",
    kind="snp",
)


def classify_eye_color(genotypes):
    observed = genotypes.lookup_variant(HERC2_SITE)

    if observed is None or observed == "--":
        return "No call", None, "missing"
    if observed == "GG":
        return "Blue", observed, "matched"
    if observed == "AA" or observed == "AG":
        return "Brown", observed, "normal"
    return "Unknown", observed, "normal"


def main():
    genotypes = bioscript.load_genotypes(input_file)
    eye_color, observed, row_status = classify_eye_color(genotypes)
    rows = [{
        "participant_id": participant_id,
        "gene": "HERC2",
        "rsid": "rs12913832",
        "location": "GRCh37 chr15:28365618",
        "kind": "SNV",
        "observed": observed,
        "row_status": row_status,
        "assay_outcome": row_status,
        "eye_color": eye_color,
    }]
    bioscript.write_tsv(output_file, rows)
    print(eye_color)


if __name__ == "__main__":
    main()
