export const Asset = {
  fromModule(moduleId: unknown) {
    return {
      uri: typeof moduleId === 'string' ? moduleId : String(moduleId),
    }
  },
}
