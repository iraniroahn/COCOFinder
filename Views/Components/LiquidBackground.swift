import SwiftUI

struct LiquidBackground: View {
    @State private var animate = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            ZStack {
                // Blob 1
                Circle()
                    .fill(Color.blue.opacity(0.4))
                    .frame(width: 300, height: 300)
                    .offset(x: animate ? -100 : 100, y: animate ? -50 : 50)
                    .blur(radius: 60)
                
                // Blob 2
                Circle()
                    .fill(Color.purple.opacity(0.4))
                    .frame(width: 300, height: 300)
                    .offset(x: animate ? 100 : -100, y: animate ? 50 : -50)
                    .blur(radius: 60)
                
                // Blob 3
                Circle()
                    .fill(Color.cyan.opacity(0.4))
                    .frame(width: 250, height: 250)
                    .offset(x: animate ? -50 : 50, y: animate ? 150 : -150)
                    .blur(radius: 60)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) {
                    animate.toggle()
                }
            }
        }
        .ignoresSafeArea()
    }
}

struct LiquidBackground_Previews: PreviewProvider {
    static var previews: some View {
        LiquidBackground()
    }
}
