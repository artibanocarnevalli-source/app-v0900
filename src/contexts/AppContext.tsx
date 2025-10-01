import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getProductComponents, checkCircularReference, processStockMovement, checkStockAvailability } from '../lib/product-operations';

const MOCK_USER_ID = 'mock-user-' + (typeof window !== 'undefined' ? window.localStorage.getItem('currentUser') ? JSON.parse(window.localStorage.getItem('currentUser')!).id : '1' : '1');

export interface Client {
  id: string;
  name: string;
  type: 'pf' | 'pj';
  cpf?: string;
  cnpj?: string;
  email: string;
  phone: string;
  mobile: string;
  razao_social?: string;
  inscricao_estadual?: string;
  isento_icms?: boolean;
  numero?: string;
  complemento?: string;
  id_empresa?: string;
  fl_ativo: boolean;
  address: {
    country: string;
    state: string;
    city: string;
    zipCode: string;
    neighborhood: string;
    streetType: string;
    street: string;
  };
  created_at: string;
  total_projects?: number;
  total_value?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'material_bruto' | 'parte_produto' | 'produto_pronto';
  unit: string;
  components: ProductComponent[];
  cost_price: number;
  sale_price?: number;
  current_stock: number;
  min_stock: number;
  supplier?: string;
  created_at: string;
}

export interface ProductComponent {
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
}

export interface ProjectProduct {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Project {
  id: string;
  number: number;
  client_id: string;
  client_name?: string;
  title: string;
  description: string;
  status: 'orcamento' | 'aprovado' | 'em_producao' | 'concluido' | 'entregue';
  type: 'orcamento' | 'venda';
  products: ProjectProduct[];
  budget: number;
  start_date: string;
  end_date: string;
  created_at: string;
  materials_cost?: number;
  labor_cost?: number;
  profit_margin?: number;
  payment_terms?: PaymentTerms;
}

export interface PaymentTerms {
  installments: number;
  payment_method: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia';
  discount_percentage: number;
  installment_value?: number;
  total_with_discount?: number;
}

export interface Transaction {
  id: string;
  project_id?: string;
  project_title?: string;
  type: 'entrada' | 'saida';
  category: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  type: 'entrada' | 'saida';
  quantity: number;
  unit_price?: number;
  total_value?: number;
  project_id?: string;
  project_title?: string;
  date: string;
  created_at: string;
}

interface AppContextType {
  clients: Client[];
  projects: Project[];
  transactions: Transaction[];
  products: Product[];
  stockMovements: StockMovement[];
  loading: boolean;
  addClient: (client: Omit<Client, 'id' | 'created_at'>) => Promise<void>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addProject: (project: Omit<Project, 'id' | 'created_at' | 'number'>) => Promise<void>;
  updateProject: (id: string, project: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'created_at'>) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'created_at'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addStockMovement: (movement: Omit<StockMovement, 'id' | 'created_at'>) => Promise<void>;
  processProjectStockMovement: (projectId: string, products: ProjectProduct[]) => Promise<void>;
  calculateProductCost: (productId: string) => Promise<number>;
  getAvailableComponents: () => Product[];
  exportClientsCSV: () => void;
  exportProductsCSV: () => void;
  exportProjectsCSV: () => void;
  exportTransactionsCSV: () => void;
  importClientsCSV: (file: File) => Promise<void>;
  importProductsCSV: (file: File) => Promise<void>;
  importProjectsCSV: (file: File) => Promise<void>;
  importTransactionsCSV: (file: File) => Promise<void>;
  getDashboardStats: () => {
    totalClients: number;
    activeProjects: number;
    monthlyRevenue: number;
    pendingPayments: number;
    lowStockItems: number;
    recentActivity: any[];
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadProducts(),
        loadClients(),
        loadProjects(),
        loadTransactions(),
        loadStockMovements()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', MOCK_USER_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading products:', error);
      return;
    }

    const productsWithComponents = await Promise.all(
      (data || []).map(async (product) => {
        const components = await getProductComponents(product.id);
        return {
          ...product,
          components,
          sale_price: product.sale_price || undefined,
          supplier: product.supplier || undefined
        };
      })
    );

    setProducts(productsWithComponents);
  };

  const loadClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', MOCK_USER_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading clients:', error);
      return;
    }

    const clientsWithStats = (data || []).map(client => ({
      ...client,
      address: {
        country: client.country,
        state: client.state,
        city: client.city,
        zipCode: client.zip_code,
        neighborhood: client.neighborhood,
        streetType: client.street_type,
        street: client.street
      },
      total_projects: 0,
      total_value: 0
    }));

    setClients(clientsWithStats);
  };

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        client:clients(name),
        project_products(*)
      `)
      .eq('user_id', MOCK_USER_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading projects:', error);
      return;
    }

    const projectsFormatted = (data || []).map((project: any) => ({
      ...project,
      client_name: project.client?.name,
      products: (project.project_products || []).map((pp: any) => ({
        id: pp.id,
        product_id: pp.product_id,
        product_name: products.find(p => p.id === pp.product_id)?.name || '',
        quantity: pp.quantity,
        unit_price: pp.unit_price,
        total_price: pp.total_price
      })),
      payment_terms: project.payment_method ? {
        installments: project.payment_installments,
        payment_method: project.payment_method,
        discount_percentage: project.discount_percentage,
        installment_value: project.budget / project.payment_installments,
        total_with_discount: project.budget * (1 - project.discount_percentage / 100)
      } : undefined
    }));

    setProjects(projectsFormatted);
  };

  const loadTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        project:projects(title)
      `)
      .eq('user_id', MOCK_USER_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading transactions:', error);
      return;
    }

    const transactionsFormatted = (data || []).map((transaction: any) => ({
      ...transaction,
      project_title: transaction.project?.title
    }));

    setTransactions(transactionsFormatted);
  };

  const loadStockMovements = async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select(`
        *,
        product:products(name),
        project:projects(title)
      `)
      .eq('user_id', MOCK_USER_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading stock movements:', error);
      return;
    }

    const movementsFormatted = (data || []).map((movement: any) => ({
      id: movement.id,
      product_id: movement.product_id,
      product_name: movement.product?.name || '',
      type: movement.movement_type,
      quantity: movement.quantity,
      unit_price: movement.unit_price,
      total_value: movement.total_value,
      project_id: movement.project_id,
      project_title: movement.project?.title,
      date: movement.date,
      created_at: movement.created_at
    }));

    setStockMovements(movementsFormatted);
  };

  const addProduct = async (productData: Omit<Product, 'id' | 'created_at'>) => {
    const { data: newProduct, error: productError } = await supabase
      .from('products')
      .insert({
        name: productData.name,
        description: productData.description,
        category: productData.category,
        type: productData.type,
        unit: productData.unit,
        cost_price: productData.cost_price,
        sale_price: productData.sale_price || null,
        current_stock: productData.current_stock,
        min_stock: productData.min_stock,
        supplier: productData.supplier || null,
        user_id: MOCK_USER_ID
      })
      .select()
      .single();

    if (productError) {
      console.error('Error adding product:', productError);
      throw productError;
    }

    if (productData.components && productData.components.length > 0) {
      for (const component of productData.components) {
        const hasCircularRef = await checkCircularReference(newProduct.id, component.product_id);
        if (hasCircularRef) {
          await supabase.from('products').delete().eq('id', newProduct.id);
          throw new Error('Referência circular detectada: um produto não pode usar a si mesmo como componente.');
        }

        await supabase.from('product_components').insert({
          product_id: newProduct.id,
          component_id: component.product_id,
          quantity: component.quantity,
          user_id: MOCK_USER_ID
        });
      }
    }

    await loadProducts();
  };

  const updateProduct = async (product: Product) => {
    const { error: productError } = await supabase
      .from('products')
      .update({
        name: product.name,
        description: product.description,
        category: product.category,
        type: product.type,
        unit: product.unit,
        cost_price: product.cost_price,
        sale_price: product.sale_price || null,
        current_stock: product.current_stock,
        min_stock: product.min_stock,
        supplier: product.supplier || null
      })
      .eq('id', product.id);

    if (productError) {
      console.error('Error updating product:', productError);
      throw productError;
    }

    await supabase
      .from('product_components')
      .delete()
      .eq('product_id', product.id);

    if (product.components && product.components.length > 0) {
      for (const component of product.components) {
        const hasCircularRef = await checkCircularReference(product.id, component.product_id);
        if (hasCircularRef) {
          throw new Error('Referência circular detectada: um produto não pode usar a si mesmo como componente.');
        }

        await supabase.from('product_components').insert({
          product_id: product.id,
          component_id: component.product_id,
          quantity: component.quantity,
          user_id: MOCK_USER_ID
        });
      }
    }

    await loadProducts();
  };

  const deleteProduct = async (id: string) => {
    const { data: usedIn } = await supabase
      .from('product_components')
      .select('product_id')
      .eq('component_id', id);

    if (usedIn && usedIn.length > 0) {
      throw new Error('Este produto é usado como componente em outros produtos e não pode ser excluído.');
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting product:', error);
      throw error;
    }

    await loadProducts();
  };

  const addClient = async (clientData: Omit<Client, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('clients')
      .insert({
        name: clientData.name,
        type: clientData.type,
        cpf: clientData.cpf || null,
        cnpj: clientData.cnpj || null,
        email: clientData.email,
        phone: clientData.phone,
        mobile: clientData.mobile,
        razao_social: clientData.razao_social || null,
        inscricao_estadual: clientData.inscricao_estadual || null,
        isento_icms: clientData.isento_icms || false,
        numero: clientData.numero || null,
        complemento: clientData.complemento || null,
        id_empresa: clientData.id_empresa || null,
        fl_ativo: clientData.fl_ativo,
        country: clientData.address.country,
        state: clientData.address.state,
        city: clientData.address.city,
        zip_code: clientData.address.zipCode,
        neighborhood: clientData.address.neighborhood,
        street_type: clientData.address.streetType,
        street: clientData.address.street,
        user_id: MOCK_USER_ID
      });

    if (error) {
      console.error('Error adding client:', error);
      throw error;
    }

    await loadClients();
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    const updateData: any = { ...updates };

    if (updates.address) {
      updateData.country = updates.address.country;
      updateData.state = updates.address.state;
      updateData.city = updates.address.city;
      updateData.zip_code = updates.address.zipCode;
      updateData.neighborhood = updates.address.neighborhood;
      updateData.street_type = updates.address.streetType;
      updateData.street = updates.address.street;
      delete updateData.address;
    }

    delete updateData.total_projects;
    delete updateData.total_value;
    delete updateData.id;
    delete updateData.created_at;

    const { error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating client:', error);
      throw error;
    }

    await loadClients();
  };

  const deleteClient = async (id: string) => {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting client:', error);
      throw error;
    }

    await loadClients();
    await loadProjects();
  };

  const addProject = async (projectData: Omit<Project, 'id' | 'created_at' | 'number'>) => {
    const { data: maxNumberResult } = await supabase
      .from('projects')
      .select('number')
      .eq('user_id', MOCK_USER_ID)
      .order('number', { ascending: false })
      .limit(1);

    const projectNumber = (maxNumberResult && maxNumberResult[0]?.number || 0) + 1;

    const { data: newProject, error: projectError } = await supabase
      .from('projects')
      .insert({
        number: projectNumber,
        client_id: projectData.client_id,
        title: projectData.title,
        description: projectData.description,
        status: projectData.status,
        type: projectData.type,
        budget: projectData.budget,
        start_date: projectData.start_date,
        end_date: projectData.end_date,
        materials_cost: projectData.materials_cost || 0,
        labor_cost: projectData.labor_cost || 0,
        profit_margin: projectData.profit_margin || 20,
        payment_installments: projectData.payment_terms?.installments || 1,
        payment_method: projectData.payment_terms?.payment_method || null,
        discount_percentage: projectData.payment_terms?.discount_percentage || 0,
        user_id: MOCK_USER_ID
      })
      .select()
      .single();

    if (projectError) {
      console.error('Error adding project:', projectError);
      throw projectError;
    }

    if (projectData.products && projectData.products.length > 0) {
      for (const product of projectData.products) {
        await supabase.from('project_products').insert({
          project_id: newProject.id,
          product_id: product.product_id,
          quantity: product.quantity,
          unit_price: product.unit_price,
          total_price: product.total_price,
          user_id: MOCK_USER_ID
        });
      }

      if (projectData.type === 'venda' && projectData.status !== 'orcamento') {
        await processProjectStockMovement(newProject.id, projectData.products);
      }
    }

    if (projectData.type === 'venda' && projectData.status !== 'orcamento') {
      const signalAmount = projectData.budget * 0.5;
      await addTransaction({
        project_id: newProject.id,
        project_title: projectData.title,
        type: 'entrada',
        category: 'Sinal',
        description: `Sinal do projeto #${projectNumber} - ${projectData.title}`,
        amount: signalAmount,
        date: new Date().toISOString().split('T')[0]
      });
    }

    await loadProjects();
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    const updateData: any = { ...updates };

    if (updates.payment_terms) {
      updateData.payment_installments = updates.payment_terms.installments;
      updateData.payment_method = updates.payment_terms.payment_method;
      updateData.discount_percentage = updates.payment_terms.discount_percentage;
      delete updateData.payment_terms;
    }

    delete updateData.id;
    delete updateData.created_at;
    delete updateData.number;
    delete updateData.client_name;
    delete updateData.products;

    const { error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating project:', error);
      throw error;
    }

    const project = projects.find(p => p.id === id);
    if (updates.status === 'concluido' && project && project.status !== 'concluido') {
      const remainingAmount = project.budget * 0.5;
      await addTransaction({
        project_id: id,
        project_title: project.title,
        type: 'entrada',
        category: 'Pagamento Final',
        description: `Pagamento final - Projeto #${project.number}`,
        amount: remainingAmount,
        date: new Date().toISOString().split('T')[0]
      });
    }

    await loadProjects();
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting project:', error);
      throw error;
    }

    await loadProjects();
    await loadTransactions();
    await loadStockMovements();
  };

  const addTransaction = async (transactionData: Omit<Transaction, 'id' | 'created_at'>) => {
    const { error } = await supabase
      .from('transactions')
      .insert({
        project_id: transactionData.project_id || null,
        type: transactionData.type,
        category: transactionData.category,
        description: transactionData.description,
        amount: transactionData.amount,
        date: transactionData.date,
        user_id: MOCK_USER_ID
      });

    if (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }

    await loadTransactions();
  };

  const addStockMovement = async (movementData: Omit<StockMovement, 'id' | 'created_at'>) => {
    await processStockMovement(
      movementData.product_id,
      movementData.quantity,
      movementData.type,
      MOCK_USER_ID,
      movementData.project_id,
      false
    );

    await loadProducts();
    await loadStockMovements();
  };

  const processProjectStockMovement = async (projectId: string, projectProducts: ProjectProduct[]) => {
    for (const projectProduct of projectProducts) {
      const product = products.find(p => p.id === projectProduct.product_id);
      if (product) {
        await processStockMovement(
          product.id,
          projectProduct.quantity,
          'saida',
          MOCK_USER_ID,
          projectId,
          true
        );
      }
    }

    await loadProducts();
    await loadStockMovements();
  };

  const calculateProductCost = async (productId: string): Promise<number> => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;

    if (product.type === 'material_bruto') {
      return product.cost_price;
    }

    let totalCost = 0;
    for (const component of product.components) {
      const componentCost = await calculateProductCost(component.product_id);
      totalCost += componentCost * component.quantity;
    }

    return totalCost;
  };

  const getAvailableComponents = (): Product[] => {
    return products;
  };

  const exportClientsCSV = () => {
    const headers = [
      'tipo', 'nome', 'endereco', 'tipopessoa', 'fone_comercial', 'fone_celular',
      'cep', 'cidade', 'email', 'cpf_cnpj', 'inscricao_estadual', 'bairro',
      'complemento', 'numero', 'isento_icms', 'razao_social', 'id_empresa', 'fl_ativo'
    ];

    const csvContent = [
      headers.join(','),
      ...clients.map(client => [
        'Cliente',
        `"${client.name}"`,
        `"${client.address.streetType} ${client.address.street}"`,
        client.type === 'pj' ? 'J' : 'F',
        `"${client.phone}"`,
        `"${client.mobile}"`,
        `"${client.address.zipCode}"`,
        `"${client.address.city}"`,
        `"${client.email}"`,
        `"${client.type === 'pj' ? client.cnpj : client.cpf}"`,
        `"${client.inscricao_estadual || ''}"`,
        `"${client.address.neighborhood}"`,
        `"${client.complemento || ''}"`,
        `"${client.numero || ''}"`,
        client.isento_icms ? 'true' : 'false',
        `"${client.razao_social || ''}"`,
        `"${client.id_empresa || ''}"`,
        client.fl_ativo ? 'true' : 'false'
      ].join(','))
    ].join('\n');

    downloadCSV(csvContent, 'clientes.csv');
  };

  const exportProductsCSV = () => {
    const headers = ['id', 'nome', 'descricao', 'categoria', 'tipo', 'unidade', 'custo', 'preco_venda', 'estoque_atual', 'estoque_minimo', 'componentes'];

    const csvContent = [
      headers.join(','),
      ...products.map(product => [
        `"${product.id}"`,
        `"${product.name}"`,
        `"${product.description}"`,
        `"${product.category}"`,
        `"${product.type}"`,
        `"${product.unit}"`,
        product.cost_price,
        product.sale_price || 0,
        product.current_stock,
        product.min_stock,
        `"${product.components.map(c => `${c.product_name}:${c.quantity}`).join(';')}"`
      ].join(','))
    ].join('\n');

    downloadCSV(csvContent, 'produtos.csv');
  };

  const exportProjectsCSV = () => {
    const headers = [
      'numero', 'cliente', 'titulo', 'descricao', 'status', 'tipo', 'orcamento',
      'data_inicio', 'data_fim', 'custo_materiais', 'custo_mao_obra', 'margem_lucro'
    ];

    const csvContent = [
      headers.join(','),
      ...projects.map(project => [
        project.number,
        `"${project.client_name}"`,
        `"${project.title}"`,
        `"${project.description}"`,
        `"${project.status}"`,
        `"${project.type}"`,
        project.budget,
        `"${project.start_date}"`,
        `"${project.end_date}"`,
        project.materials_cost || 0,
        project.labor_cost || 0,
        project.profit_margin || 0
      ].join(','))
    ].join('\n');

    downloadCSV(csvContent, 'projetos.csv');
  };

  const exportTransactionsCSV = () => {
    const headers = ['tipo', 'categoria', 'descricao', 'valor', 'data', 'projeto'];

    const csvContent = [
      headers.join(','),
      ...transactions.map(transaction => [
        `"${transaction.type}"`,
        `"${transaction.category}"`,
        `"${transaction.description}"`,
        transaction.amount,
        `"${transaction.date}"`,
        `"${transaction.project_title || ''}"`
      ].join(','))
    ].join('\n');

    downloadCSV(csvContent, 'transacoes.csv');
  };

  const importClientsCSV = async (file: File): Promise<void> => {
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < headers.length) continue;

      const clientData: Omit<Client, 'id' | 'created_at'> = {
        name: values[1] || '',
        type: values[3] === 'J' ? 'pj' : 'pf',
        cpf: values[3] === 'F' ? values[9] : undefined,
        cnpj: values[3] === 'J' ? values[9] : undefined,
        email: values[8] || '',
        phone: values[4] || '',
        mobile: values[5] || '',
        razao_social: values[15] || undefined,
        inscricao_estadual: values[10] || undefined,
        isento_icms: values[14] === 'true',
        numero: values[13] || undefined,
        complemento: values[12] || undefined,
        id_empresa: values[16] || undefined,
        fl_ativo: values[17] !== 'false',
        address: {
          country: 'Brasil',
          state: '',
          city: values[7] || '',
          zipCode: values[6] || '',
          neighborhood: values[11] || '',
          streetType: 'Rua',
          street: values[2] || ''
        },
        total_projects: 0,
        total_value: 0
      };

      await addClient(clientData);
    }
  };

  const importProductsCSV = async (file: File): Promise<void> => {
    const text = await file.text();
    const lines = text.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < 10) continue;

      const productData: Omit<Product, 'id' | 'created_at'> = {
        name: values[1] || '',
        description: values[2] || '',
        category: values[3] || '',
        type: (values[4] as any) || 'material_bruto',
        unit: values[5] || 'UN',
        cost_price: parseFloat(values[6]) || 0,
        sale_price: parseFloat(values[7]) || undefined,
        current_stock: parseFloat(values[8]) || 0,
        min_stock: parseFloat(values[9]) || 0,
        components: []
      };

      await addProduct(productData);
    }
  };

  const importProjectsCSV = async (file: File): Promise<void> => {
    const text = await file.text();
    const lines = text.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < 8) continue;

      const client = clients.find(c => c.name === values[1]);
      if (!client) continue;

      const projectData: Omit<Project, 'id' | 'created_at' | 'number'> = {
        client_id: client.id,
        client_name: values[1],
        title: values[2] || '',
        description: values[3] || '',
        status: (values[4] as any) || 'orcamento',
        type: (values[5] as any) || 'orcamento',
        products: [],
        budget: parseFloat(values[6]) || 0,
        start_date: values[7] || new Date().toISOString().split('T')[0],
        end_date: values[8] || new Date().toISOString().split('T')[0],
        materials_cost: parseFloat(values[9]) || 0,
        labor_cost: parseFloat(values[10]) || 0,
        profit_margin: parseFloat(values[11]) || 20
      };

      await addProject(projectData);
    }
  };

  const importTransactionsCSV = async (file: File): Promise<void> => {
    const text = await file.text();
    const lines = text.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < 5) continue;

      const transactionData: Omit<Transaction, 'id' | 'created_at'> = {
        type: (values[0] as any) || 'entrada',
        category: values[1] || '',
        description: values[2] || '',
        amount: parseFloat(values[3]) || 0,
        date: values[4] || new Date().toISOString().split('T')[0],
        project_title: values[5] || undefined
      };

      await addTransaction(transactionData);
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSVLine = (line: string): string[] => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const getDashboardStats = () => {
    const totalClients = clients.length;
    const activeProjects = projects.filter(p =>
      p.status === 'em_producao' || p.status === 'aprovado'
    ).length;

    const currentMonth = new Date().getMonth();
    const monthlyRevenue = transactions
      .filter(t =>
        t.type === 'entrada' &&
        new Date(t.date).getMonth() === currentMonth
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingPayments = projects
      .filter(p => p.status === 'concluido' || p.status === 'entregue')
      .reduce((sum, p) => sum + (p.budget * 0.5), 0);

    const lowStockItems = products.filter(p => p.current_stock <= p.min_stock).length;

    const recentActivity = [
      ...projects.slice(-3).map(p => ({
        type: 'project',
        message: `Novo projeto #${p.number}: ${p.title}`,
        date: p.created_at
      })),
      ...transactions.slice(-3).map(t => ({
        type: 'transaction',
        message: `${t.type === 'entrada' ? 'Recebimento' : 'Pagamento'}: R$ ${t.amount.toLocaleString()}`,
        date: t.created_at
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

    return {
      totalClients,
      activeProjects,
      monthlyRevenue,
      pendingPayments,
      lowStockItems,
      recentActivity
    };
  };

  return (
    <AppContext.Provider value={{
      clients,
      projects,
      transactions,
      products,
      stockMovements,
      loading,
      addClient,
      updateClient,
      deleteClient,
      addProject,
      updateProject,
      deleteProject,
      addTransaction,
      addProduct,
      updateProduct,
      deleteProduct,
      addStockMovement,
      processProjectStockMovement,
      calculateProductCost,
      getAvailableComponents,
      exportClientsCSV,
      exportProductsCSV,
      exportProjectsCSV,
      exportTransactionsCSV,
      importClientsCSV,
      importProductsCSV,
      importProjectsCSV,
      importTransactionsCSV,
      getDashboardStats
    }}>
      {children}
    </AppContext.Provider>
  );
};
