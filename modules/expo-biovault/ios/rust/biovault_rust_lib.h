#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

/**
 * Process a 23andMe file and create SQLite database
 * Returns the database name on success
 */
char *process_23andme_file(const char *input_path, const char *custom_name, const char *output_dir);

/**
 * Free memory allocated by process_23andme_file
 */
void free_string(char *ptr);

int32_t rust_add(int32_t a, int32_t b);
