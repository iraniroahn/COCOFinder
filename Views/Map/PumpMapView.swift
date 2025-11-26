import SwiftUI
import MapKit

struct PumpMapView: View {
    @ObservedObject var viewModel: PumpViewModel
    @ObservedObject var locationManager: LocationManager
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 20.5937, longitude: 78.9629), // Center of India
        span: MKCoordinateSpan(latitudeDelta: 20, longitudeDelta: 20)
    )
    
    var body: some View {
        Map(coordinateRegion: $region, showsUserLocation: true, annotationItems: viewModel.filteredPumps) { pump in
            MapAnnotation(coordinate: pump.coordinate) {
                NavigationLink(destination: PumpDetailView(pump: pump)) {
                    VStack {
                        Image(systemName: "fuelpump.fill")
                            .resizable()
                            .foregroundColor(.red)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(Color.white).frame(width: 40, height: 40))
                            .shadow(radius: 5)
                        
                        Text(pump.name)
                            .font(.caption)
                            .padding(5)
                            .background(Color.white.opacity(0.8))
                            .cornerRadius(5)
                            .opacity(0.8)
                    }
                }
            }
        }
        .onAppear {
            if let userLocation = locationManager.location {
                withAnimation {
                    region = MKCoordinateRegion(
                        center: userLocation.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
                    )
                }
            }
        }
        .onChange(of: locationManager.location) { newLocation in
            if let newLocation = newLocation {
                withAnimation {
                    region = MKCoordinateRegion(
                        center: newLocation.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
                    )
                }
            }
        }
    }
}
