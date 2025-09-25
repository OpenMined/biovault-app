#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

/**
 * Process a 23andMe file and create an SQLite database.
 *
 * Returns a newly-allocated C string containing the full path to the
 * created database file on success, or a null pointer on error.
 *
 * # Safety
 * - `input_path`, `custom_name`, and `output_dir` must be valid pointers to
 *   NUL-terminated UTF-8 strings and remain valid for the duration of the call.
 * - The returned pointer must be freed by calling `free_string` exactly once.
 * - Passing null or invalid pointers, or freeing the returned pointer by any
 *   other means is undefined behavior.
 */
char *process_23andme_file(const char *input_path, const char *custom_name, const char *output_dir);

/**
 * Free memory allocated by `process_23andme_file`.
 *
 * # Safety
 * - `ptr` must be a pointer previously returned by `process_23andme_file`.
 * - It must not have been freed already.
 * - Passing any other pointer, or double-freeing, is undefined behavior.
 */
void free_string(char *ptr);

int32_t rust_add(int32_t a, int32_t b);

/**
 * Analyze user genome against ClinVar database
 */
char *analyze_clinvar(const char *user_db_path, const char *clinvar_db_path);
