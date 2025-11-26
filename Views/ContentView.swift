import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = PumpViewModel()
    @StateObject private var locationManager = LocationManager()
    
    var body: some View {
        NavigationView {
            ZStack {
                LiquidBackground()
                
                VStack(spacing: 20) {
                    // Header
                    HStack {
                        VStack(alignment: .leading) {
                            Text("COCO Finder")
                                .font(.largeTitle)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                            Text("Find nearest IOCL pumps")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.8))
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.top, 20)
                    
                    // Search
                    SearchBar(text: $viewModel.searchText)
                        .padding(.horizontal)
                    
                    // Main Content
                    ScrollView {
                        VStack(spacing: 20) {
                            // Map Preview
                            NavigationLink(destination: PumpMapView(viewModel: viewModel, locationManager: locationManager)) {
                                ZStack(alignment: .bottomLeading) {
                                    MapPreview(viewModel: viewModel)
                                        .frame(height: 200)
                                        .cornerRadius(20)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 20)
                                                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                        )
                                    
                                    HStack {
                                        Image(systemName: "map.fill")
                                        Text("Open Interactive Map")
                                            .fontWeight(.semibold)
                                    }
                                    .padding()
                                    .background(Color.black.opacity(0.6))
                                    .foregroundColor(.white)
                                    .cornerRadius(10)
                                    .padding()
                                }
                            }
                            .padding(.horizontal)
                            
                            // List of Pumps
                            LazyVStack(spacing: 15) {
                                ForEach(viewModel.filteredPumps) { pump in
                                    NavigationLink(destination: PumpDetailView(pump: pump)) {
                                        PumpRow(pump: pump)
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
            }
            .navigationBarHidden(true)
        }
        .accentColor(.white)
    }
}

struct PumpRow: View {
    let pump: PetrolPump
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 5) {
                Text(pump.name)
                    .font(.headline)
                    .foregroundColor(.white)
                Text(pump.address)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundColor(.white.opacity(0.5))
        }
        .padding()
        .glassCard()
    }
}

struct MapPreview: View {
    @ObservedObject var viewModel: PumpViewModel
    
    var body: some View {
        // Simplified map view for preview
        GeometryReader { geometry in
            ZStack {
                Color.black.opacity(0.3)
                Text("Map View")
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
