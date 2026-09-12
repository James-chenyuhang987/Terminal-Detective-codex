export function useAuth() {
  return {
    user: { uid: 'presentation-fixture', email: 'fixture@example.test' },
    providers: ['password'],
    isAuthenticated: true,
    isLoadingAuth: false,
    authChecked: true,
    linkGitHub: async () => true,
    unlinkGitHub: async () => true,
    addPassword: async () => true,
    changePassword: async () => true,
    logout: async () => true,
  };
}

export function AuthProvider({ children }) { return children; }
export default function AuthContextMock({ children }) { return children; }
